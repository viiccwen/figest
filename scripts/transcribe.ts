import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AudioManifest, RawContentItem, RawTranscriptArtifact, TranscriptItem, TranscriptSegment } from '../src/lib/types'
import { inspectAudio } from './audio/inspect'
import { getAudioPreprocessingConfig, preprocessAudio } from './audio/preprocess'
import { audioManifestDir, ensureDirs, rawDir, rawTranscriptDir, readJson, transcriptDir, writeJson } from './shared'
import { createWhisperCompatibleProvider } from './transcription/whisper-compatible'

type RawContentItemWithAudio = RawContentItem & { audioUrl: string }

const limitArg = parseLimit(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.WHISPER_TRANSCRIBE_LIMIT)
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
    await preprocessAudio(raw.audioUrl, segmentPattern, preprocessing)

    const audioSegments = (await readdir(tempDir)).filter((name) => name.endsWith('.mp3')).sort()
    if (audioSegments.length === 0) throw new Error('ffmpeg produced no audio segments')

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
        warnings: audioInspection.warnings,
      },
      preprocessing: {
        targetSampleRate: preprocessing.targetSampleRate,
        channels: preprocessing.channels,
        bitrate: preprocessing.bitrate,
        segmentSeconds: preprocessing.segmentSeconds,
        vadEnabled: preprocessing.vadEnabled,
      },
    }
    await writeJson(audioManifestPath, audioManifest)

    const texts: string[] = []
    const transcriptSegments: TranscriptSegment[] = []
    const warnings: string[] = [...audioInspection.warnings]
    for (const [index, segment] of audioSegments.entries()) {
      console.log(`  segment ${index + 1}/${audioSegments.length}`)
      const segmentStart = index * preprocessing.segmentSeconds
      const segmentEnd = (index + 1) * preprocessing.segmentSeconds
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

function hasAudioUrl(raw: RawContentItem): raw is RawContentItemWithAudio {
  return typeof raw.audioUrl === 'string' && raw.audioUrl.length > 0
}

function parseLimit(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 2

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 2

  return Math.floor(parsed)
}
