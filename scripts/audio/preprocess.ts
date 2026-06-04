import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type AudioPreprocessingConfig = {
  targetSampleRate: number
  channels: number
  bitrate: string
  segmentSeconds: number
  vadEnabled: false
}

export const DEFAULT_AUDIO_SEGMENT_SECONDS = 900
export const DEFAULT_AUDIO_TARGET_BITRATE = '32k'
export const DEFAULT_AUDIO_TARGET_SAMPLE_RATE = 16000
export const DEFAULT_AUDIO_TARGET_CHANNELS = 1

export function getAudioPreprocessingConfig(env: NodeJS.ProcessEnv = process.env): AudioPreprocessingConfig {
  return {
    segmentSeconds: parsePositiveNumber(env.AUDIO_SEGMENT_SECONDS ?? env.WHISPER_SEGMENT_SECONDS, DEFAULT_AUDIO_SEGMENT_SECONDS),
    bitrate: env.AUDIO_TARGET_BITRATE ?? env.WHISPER_AUDIO_BITRATE ?? DEFAULT_AUDIO_TARGET_BITRATE,
    targetSampleRate: parsePositiveNumber(env.AUDIO_TARGET_SAMPLE_RATE, DEFAULT_AUDIO_TARGET_SAMPLE_RATE),
    channels: parsePositiveNumber(env.AUDIO_TARGET_CHANNELS, DEFAULT_AUDIO_TARGET_CHANNELS),
    vadEnabled: false,
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
    String(config.segmentSeconds),
    segmentPattern,
  ]
}

export async function preprocessAudio(inputUrlOrPath: string, segmentPattern: string, config = getAudioPreprocessingConfig()): Promise<void> {
  await execFileAsync('ffmpeg', buildFfmpegPreprocessArgs(inputUrlOrPath, segmentPattern, config), { timeout: 1000 * 60 * 30 })
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
