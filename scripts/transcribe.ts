import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AudioManifest, RawContentItem, RawTranscriptArtifact, TranscriptItem, TranscriptSegment } from '../src/lib/types'
import { inspectAudio } from './audio/inspect'
import { planFixedChunks } from './audio/chunk-plan'
import { getAudioPreprocessingConfig, preprocessAudio } from './audio/preprocess'
import { audioManifestDir, ensureDirs, rawDir, rawTranscriptDir, readJson, transcriptDir, writeJson } from './shared'
import { createWhisperCompatibleProvider } from './transcription/whisper-compatible'

type RawContentItemWithAudio = RawContentItem & { audioUrl: string }

const limitArg = parseLimit(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.WHISPER_TRANSCRIBE_LIMIT)
const maxItemsArg = parseOptionalPositiveInteger(
  process.argv.find((arg) => arg.startsWith('--max-items='))?.split('=')[1] ?? process.env.WHISPER_TRANSCRIBE_MAX_ITEMS,
)
const onlySource = process.argv.find((arg) => arg.startsWith('--source='))?.split('=')[1]
const force = process.argv.includes('--force')

const apiUrl = process.env.WHISPER_API_URL ?? 'https://api.openai.com/v1/audio/transcriptions'
const apiKey = process.env.WHISPER_API_KEY ?? process.env.OPENAI_API_KEY
const model = process.env.WHISPER_MODEL ?? (process.env.WHISPER_API_URL ? '' : 'whisper-1')
const language = process.env.WHISPER_LANGUAGE ?? 'zh'
const preprocessing = getAudioPreprocessingConfig()

if (!apiKey) {
  console.error('Missing WHISPER_API_KEY or OPENAI_API_KEY. Skip transcription until the API key is configured.')
  process.exit(1)
}

const provider = createWhisperCompatibleProvider({ apiUrl, apiKey, model, language })

await ensureDirs()

const rawFiles = (await readdir(rawDir)).filter((file) => file.endsWith('.json'))
const rawItems = await Promise.all(rawFiles.map((file) => readJson<RawContentItem>(path.join(rawDir, file))))
const transcribableItems = rawItems
  .filter(hasAudioUrl)
  .filter((raw) => !onlySource || raw.sourceId === onlySource)
  .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  .slice(0, maxItemsArg ?? undefined)
let done = 0
let skipped = rawItems.length - transcribableItems.length

for (const raw of transcribableItems) {
  if (done >= limitArg) break

  const outputPath = path.join(transcriptDir, `${raw.id}.json`)
  const rawTranscriptPath = path.join(rawTranscriptDir, `${raw.id}.json`)
  const audioManifestPath = path.join(audioManifestDir, `${raw.id}.json`)
  if (!force) {
    try {
      await access(outputPath)
      skipped += 1
      continue
    } catch {
      // continue when transcript does not exist
    }
  }

  console.log(`Transcribing ${raw.sourceId}: ${raw.title}`)
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `finance-digest-${raw.id}-`))
  try {
    const audioInspection = await inspectAudio(raw.audioUrl)
    const segmentPattern = path.join(tempDir, 'part-%03d.mp3')
    const preprocessingResult = await preprocessAudio(raw.audioUrl, segmentPattern, preprocessing, audioInspection.durationSeconds)

    const audioSegments = (await readdir(tempDir)).filter((name) => name.endsWith('.mp3')).sort()
    if (audioSegments.length === 0) throw new Error('ffmpeg produced no audio segments')

    const plannedChunks = resolveChunkMetadata(audioSegments.length, preprocessingResult.chunks, audioInspection.durationSeconds, preprocessing.segmentSeconds)
    const preprocessingWarnings = [...preprocessingResult.warnings]
    if (preprocessingResult.chunks.length > 0 && preprocessingResult.chunks.length !== audioSegments.length) {
      preprocessingWarnings.push(
        `chunk metadata count mismatch: planned ${preprocessingResult.chunks.length}, ffmpeg produced ${audioSegments.length}; using monotonic fallback metadata`,
      )
    }

    const audioManifest: AudioManifest = {
      id: raw.id,
      rawItemId: raw.id,
      sourceId: raw.sourceId,
      audioUrl: raw.audioUrl,
      fetchedAt: raw.fetchedAt,
      metadata: {
        durationSeconds: audioInspection.durationSeconds,
        codec: audioInspection.codec,
        sampleRate: audioInspection.sampleRate,
        channels: audioInspection.channels,
        warnings: [...audioInspection.warnings, ...preprocessingWarnings],
      },
      preprocessing: {
        targetSampleRate: preprocessing.targetSampleRate,
        channels: preprocessing.channels,
        bitrate: preprocessing.bitrate,
        segmentSeconds: preprocessing.segmentSeconds,
        vadEnabled: preprocessing.vadEnabled,
        strategy: preprocessingResult.strategy,
        minChunkSeconds: preprocessing.minChunkSeconds,
        maxChunkSeconds: preprocessing.maxChunkSeconds,
        boundaryToleranceSeconds: preprocessing.boundaryToleranceSeconds,
        vadMinSilenceDurationSeconds: preprocessing.vadMinSilenceDurationSeconds,
        vadSilenceThresholdDb: preprocessing.vadSilenceThresholdDb,
        warnings: preprocessingWarnings,
      },
      chunks: plannedChunks.map((chunk, index) => ({
        index,
        file: audioSegments[index],
        start: chunk.start,
        end: chunk.end,
        boundary: chunk.boundary,
      })),
    }
    await writeJson(audioManifestPath, audioManifest)

    const texts: string[] = []
    const transcriptSegments: TranscriptSegment[] = []
    const warnings: string[] = [...audioInspection.warnings, ...preprocessingWarnings]
    for (const [index, segment] of audioSegments.entries()) {
      console.log(`  segment ${index + 1}/${audioSegments.length}`)
      const chunk = plannedChunks[index]
      const segmentStart = chunk.start
      const segmentEnd = chunk.end
      const segmentId = `${raw.id}-part-${index + 1}`
      const result = await provider.transcribe(path.join(tempDir, segment), {
        model,
        language,
        segmentStart,
        segmentEnd,
        segmentId,
      })
      const text = result.text.trim()
      texts.push(text)
      transcriptSegments.push(...(result.segments?.length ? result.segments : [synthesizeSegment(segmentId, segmentStart, segmentEnd, text)]))
      warnings.push(...(result.warnings ?? []))
    }

    const transcribedAt = new Date().toISOString()
    const text = texts.join('\n\n').trim()
    const transcript: TranscriptItem = {
      id: raw.id,
      rawItemId: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      audioUrl: raw.audioUrl,
      transcribedAt,
      model,
      language,
      segmentCount: audioSegments.length,
      text,
    }
    const rawTranscript: RawTranscriptArtifact = {
      id: raw.id,
      rawItemId: raw.id,
      sourceId: raw.sourceId,
      provider: provider.name,
      model,
      language,
      transcribedAt,
      audioUrl: raw.audioUrl,
      segments: transcriptSegments,
      text,
      warnings,
    }
    await writeJson(outputPath, transcript)
    await writeJson(rawTranscriptPath, rawTranscript)
    done += 1
    console.log(`✓ wrote ${audioManifestPath}`)
    console.log(`✓ wrote ${outputPath}`)
    console.log(`✓ wrote ${rawTranscriptPath}`)
  } catch (error) {
    skipped += 1
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`⚠ skipped ${raw.id}: ${message}`)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

console.log(`Transcribed ${done} item(s), skipped ${skipped} item(s).`)

function synthesizeSegment(id: string, start: number, end: number, text: string): TranscriptSegment {
  return { id, start, end, text }
}

function resolveChunkMetadata(
  segmentCount: number,
  plannedChunks: Array<{ start: number; end: number; boundary: 'silence' | 'fixed' | 'duration' }>,
  durationSeconds: number | undefined,
  segmentSeconds: number,
): Array<{ start: number; end: number; boundary: 'silence' | 'fixed' | 'duration' }> {
  if (plannedChunks.length === segmentCount && isMonotonic(plannedChunks)) return plannedChunks

  if (durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const fixed = planFixedChunks(durationSeconds, segmentSeconds)
    if (fixed.length === segmentCount) return fixed
  }

  return Array.from({ length: segmentCount }, (_, index) => ({
    start: index * segmentSeconds,
    end: (index + 1) * segmentSeconds,
    boundary: 'fixed' as const,
  }))
}

function isMonotonic(chunks: Array<{ start: number; end: number }>): boolean {
  return chunks.every((chunk, index) => chunk.end > chunk.start && (index === 0 || chunk.start >= chunks[index - 1].end))
}

function hasAudioUrl(raw: RawContentItem): raw is RawContentItemWithAudio {
  return typeof raw.audioUrl === 'string' && raw.audioUrl.length > 0
}

function parseLimit(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 2

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 2

  return Math.floor(parsed)
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined

  return Math.floor(parsed)
}
