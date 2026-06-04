import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { type AudioChunk, type ChunkPlan, parseSilencedetectOutput, planAudioChunks } from './chunk-plan'

const execFileAsync = promisify(execFile)

export type AudioPreprocessingConfig = {
  targetSampleRate: number
  channels: number
  bitrate: string
  segmentSeconds: number
  vadEnabled: boolean
  vadMinSilenceDurationSeconds: number
  vadSilenceThresholdDb: string
  minChunkSeconds: number
  maxChunkSeconds: number
  boundaryToleranceSeconds: number
}

export type AudioPreprocessingResult = {
  strategy: 'fixed' | 'silence-aware'
  chunks: AudioChunk[]
  warnings: string[]
}

export const DEFAULT_AUDIO_SEGMENT_SECONDS = 900
export const DEFAULT_AUDIO_TARGET_BITRATE = '32k'
export const DEFAULT_AUDIO_TARGET_SAMPLE_RATE = 16000
export const DEFAULT_AUDIO_TARGET_CHANNELS = 1
export const DEFAULT_AUDIO_VAD_MIN_SILENCE_SECONDS = 0.6
export const DEFAULT_AUDIO_VAD_SILENCE_THRESHOLD_DB = '-35dB'
export const DEFAULT_AUDIO_MIN_CHUNK_SECONDS = 60
export const DEFAULT_AUDIO_BOUNDARY_TOLERANCE_SECONDS = 30

export function getAudioPreprocessingConfig(env: NodeJS.ProcessEnv = process.env): AudioPreprocessingConfig {
  const segmentSeconds = parsePositiveNumber(firstNonEmpty(env.AUDIO_SEGMENT_SECONDS, env.WHISPER_SEGMENT_SECONDS), DEFAULT_AUDIO_SEGMENT_SECONDS)
  const maxChunkSeconds = parsePositiveNumber(firstNonEmpty(env.AUDIO_MAX_CHUNK_SECONDS, env.WHISPER_MAX_CHUNK_SECONDS), segmentSeconds)

  const minChunkSeconds = Math.min(
    parsePositiveNumber(env.AUDIO_MIN_CHUNK_SECONDS, Math.min(DEFAULT_AUDIO_MIN_CHUNK_SECONDS, maxChunkSeconds)),
    maxChunkSeconds,
  )

  return {
    segmentSeconds,
    bitrate: firstNonEmpty(env.AUDIO_TARGET_BITRATE, env.WHISPER_AUDIO_BITRATE) ?? DEFAULT_AUDIO_TARGET_BITRATE,
    targetSampleRate: parsePositiveNumber(env.AUDIO_TARGET_SAMPLE_RATE, DEFAULT_AUDIO_TARGET_SAMPLE_RATE),
    channels: parsePositiveNumber(env.AUDIO_TARGET_CHANNELS, DEFAULT_AUDIO_TARGET_CHANNELS),
    vadEnabled: parseBoolean(firstNonEmpty(env.ENABLE_AUDIO_VAD, env.AUDIO_VAD_ENABLED), false),
    vadMinSilenceDurationSeconds: parsePositiveNumber(env.AUDIO_VAD_MIN_SILENCE_SECONDS, DEFAULT_AUDIO_VAD_MIN_SILENCE_SECONDS),
    vadSilenceThresholdDb: normalizeDbThreshold(env.AUDIO_VAD_SILENCE_THRESHOLD_DB, DEFAULT_AUDIO_VAD_SILENCE_THRESHOLD_DB),
    minChunkSeconds,
    maxChunkSeconds,
    boundaryToleranceSeconds: parseNonNegativeNumber(env.AUDIO_CHUNK_BOUNDARY_TOLERANCE_SECONDS, DEFAULT_AUDIO_BOUNDARY_TOLERANCE_SECONDS),
  }
}

export function buildFfmpegPreprocessArgs(inputUrlOrPath: string, segmentPattern: string, config: AudioPreprocessingConfig): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputUrlOrPath,
    '-vn',
    '-ac',
    String(config.channels),
    '-ar',
    String(config.targetSampleRate),
    '-b:a',
    config.bitrate,
    '-f',
    'segment',
    '-segment_time',
    String(config.maxChunkSeconds),
    segmentPattern,
  ]
}

export function buildFfmpegSilenceAwareSegmentArgs(inputUrlOrPath: string, segmentPattern: string, cutTimes: number[], config: AudioPreprocessingConfig): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputUrlOrPath,
    '-vn',
    '-ac',
    String(config.channels),
    '-ar',
    String(config.targetSampleRate),
    '-b:a',
    config.bitrate,
    '-f',
    'segment',
    '-segment_times',
    cutTimes.map((time) => String(time)).join(','),
    segmentPattern,
  ]
}

export function buildFfmpegSilencedetectArgs(inputUrlOrPath: string, config: AudioPreprocessingConfig): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-i',
    inputUrlOrPath,
    '-af',
    `silencedetect=n=${config.vadSilenceThresholdDb}:d=${config.vadMinSilenceDurationSeconds}`,
    '-f',
    'null',
    '-',
  ]
}

export async function preprocessAudio(
  inputUrlOrPath: string,
  segmentPattern: string,
  config = getAudioPreprocessingConfig(),
  durationSeconds?: number,
): Promise<AudioPreprocessingResult> {
  const plan = await createAudioChunkPlan(inputUrlOrPath, config, durationSeconds)

  if (plan.strategy === 'silence-aware' && plan.chunks.length > 0) {
    const cutTimes = plan.chunks.slice(0, -1).map((chunk) => chunk.end)
    try {
      await execFileAsync('ffmpeg', buildFfmpegSilenceAwareSegmentArgs(inputUrlOrPath, segmentPattern, cutTimes, config), { timeout: 1000 * 60 * 30 })
      return { strategy: plan.strategy, chunks: plan.chunks, warnings: plan.warnings }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const warnings = [
        ...plan.warnings,
        `silence-aware chunking fell back to fixed chunks: segmentation failed: ${message}`,
      ]
      await execFileAsync('ffmpeg', buildFfmpegPreprocessArgs(inputUrlOrPath, segmentPattern, config), { timeout: 1000 * 60 * 30 })
      return { strategy: 'fixed', chunks: [], warnings }
    }
  }

  await execFileAsync('ffmpeg', buildFfmpegPreprocessArgs(inputUrlOrPath, segmentPattern, config), { timeout: 1000 * 60 * 30 })
  return { strategy: 'fixed', chunks: plan.chunks, warnings: plan.warnings }
}

export async function createAudioChunkPlan(inputUrlOrPath: string, config: AudioPreprocessingConfig, durationSeconds?: number): Promise<ChunkPlan> {
  if (!config.vadEnabled) {
    return { strategy: 'fixed', chunks: [], silenceBoundaryCount: 0, warnings: [] }
  }

  try {
    const { stderr, stdout } = await execFileAsync('ffmpeg', buildFfmpegSilencedetectArgs(inputUrlOrPath, config), {
      timeout: 1000 * 60 * 10,
      maxBuffer: 1024 * 1024 * 8,
    })
    const silences = parseSilencedetectOutput(`${stderr}\n${stdout}`)
    return planAudioChunks(silences, {
      durationSeconds,
      maxChunkSeconds: config.maxChunkSeconds,
      minChunkSeconds: config.minChunkSeconds,
      boundaryToleranceSeconds: config.boundaryToleranceSeconds,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      strategy: 'fixed',
      chunks: [],
      silenceBoundaryCount: 0,
      warnings: [`silence-aware chunking fell back to fixed chunks: silencedetect failed: ${message}`],
    }
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim() !== '')
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function normalizeDbThreshold(value: string | undefined, fallback: string): string {
  if (!value || value.trim() === '') return fallback
  const trimmed = value.trim()
  return trimmed.toLowerCase().endsWith('db') ? trimmed : `${trimmed}dB`
}
