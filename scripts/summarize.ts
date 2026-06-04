import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { NormalizedTranscriptArtifact, RawContentItem, TranscriptItem } from '../src/lib/types'
import { ensureDirs, heuristicSummary, normalizedTranscriptDir, rawDir, readJson, summaryDir, transcriptDir, writeJson } from './shared'

await ensureDirs()
const files = (await readdir(rawDir)).filter((file) => file.endsWith('.json'))
let count = 0
let transcriptCount = 0
for (const file of files) {
  const raw = await readJson<RawContentItem>(path.join(rawDir, file))
  const transcript = await readPreferredTranscript(raw.id)
  if (transcript?.text) transcriptCount += 1
  const summary = heuristicSummary(raw, transcript?.text)
  await writeJson(path.join(summaryDir, `${summary.id}.json`), summary)
  count += 1
}
console.log(`Summarized ${count} item(s), ${transcriptCount} with transcript.`)

async function readPreferredTranscript(rawId: string) {
  return (await readOptionalTranscript<NormalizedTranscriptArtifact>(path.join(normalizedTranscriptDir, `${rawId}.json`)))
    ?? (await readOptionalTranscript<TranscriptItem>(path.join(transcriptDir, `${rawId}.json`)))
}

async function readOptionalTranscript<T extends { text?: string }>(filePath: string) {
  try {
    return await readJson<T>(filePath)
  } catch {
    return undefined
  }
}
