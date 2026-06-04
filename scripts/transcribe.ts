import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { RawContentItem, TranscriptItem } from '../src/lib/types'
import { ensureDirs, rawDir, readJson, transcriptDir, writeJson } from './shared'

const execFileAsync = promisify(execFile)

const limitArg = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.WHISPER_TRANSCRIBE_LIMIT ?? 2)
const onlySource = process.argv.find((arg) => arg.startsWith('--source='))?.split('=')[1]
const force = process.argv.includes('--force')

const apiUrl = process.env.WHISPER_API_URL ?? 'https://api.openai.com/v1/audio/transcriptions'
const apiKey = process.env.WHISPER_API_KEY ?? process.env.OPENAI_API_KEY
const model = process.env.WHISPER_MODEL ?? (process.env.WHISPER_API_URL ? '' : 'whisper-1')
const language = process.env.WHISPER_LANGUAGE ?? 'zh'
const segmentSeconds = Number(process.env.WHISPER_SEGMENT_SECONDS ?? 900)
const bitrate = process.env.WHISPER_AUDIO_BITRATE ?? '32k'

if (!apiKey) {
  console.error('Missing WHISPER_API_KEY or OPENAI_API_KEY. Skip transcription until the API key is configured.')
  process.exit(1)
}

await ensureDirs()

const rawFiles = (await readdir(rawDir)).filter((file) => file.endsWith('.json'))
const rawItems = await Promise.all(rawFiles.map((file) => readJson<RawContentItem>(path.join(rawDir, file))))
const transcribableItems = rawItems
  .filter((raw) => raw.audioUrl)
  .filter((raw) => !onlySource || raw.sourceId === onlySource)
  .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
let done = 0
let skipped = rawItems.length - transcribableItems.length

for (const raw of transcribableItems) {
  if (done >= limitArg) break

  const outputPath = path.join(transcriptDir, `${raw.id}.json`)
  if (!force) {
    try {
      await readFile(outputPath, 'utf8')
      skipped += 1
      continue
    } catch {
      // continue when transcript does not exist
    }
  }

  console.log(`Transcribing ${raw.sourceId}: ${raw.title}`)
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `finance-digest-${raw.id}-`))
  try {
    const segmentPattern = path.join(tempDir, 'part-%03d.mp3')
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      raw.audioUrl,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      bitrate,
      '-f',
      'segment',
      '-segment_time',
      String(segmentSeconds),
      segmentPattern,
    ], { timeout: 1000 * 60 * 30 })

    const segments = (await readdir(tempDir)).filter((name) => name.endsWith('.mp3')).sort()
    if (segments.length === 0) throw new Error('ffmpeg produced no audio segments')

    const texts: string[] = []
    for (const [index, segment] of segments.entries()) {
      console.log(`  segment ${index + 1}/${segments.length}`)
      texts.push(await transcribeSegment(path.join(tempDir, segment)))
    }

    const transcript: TranscriptItem = {
      id: raw.id,
      rawItemId: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      audioUrl: raw.audioUrl,
      transcribedAt: new Date().toISOString(),
      model,
      language,
      segmentCount: segments.length,
      text: texts.join('\n\n').trim(),
    }
    await writeJson(outputPath, transcript)
    done += 1
    console.log(`✓ wrote ${outputPath}`)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

console.log(`Transcribed ${done} item(s), skipped ${skipped} item(s).`)

async function transcribeSegment(filePath: string) {
  const bytes = await readFile(filePath)
  const form = new FormData()
  if (model) form.set('model', model)
  form.set('language', language)
  form.set('response_format', 'json')
  form.set('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(filePath))

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Whisper API failed ${response.status}: ${detail.slice(0, 500)}`)
  }

  const data = await response.json() as { text?: string }
  return data.text?.trim() ?? ''
}
