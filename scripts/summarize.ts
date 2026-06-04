import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { RawContentItem, TranscriptItem } from '../src/lib/types'
import { ensureDirs, heuristicSummary, rawDir, readJson, summaryDir, transcriptDir, writeJson } from './shared'

await ensureDirs()
const files = (await readdir(rawDir)).filter((file) => file.endsWith('.json'))
let count = 0
let transcriptCount = 0
for (const file of files) {
  const raw = await readJson<RawContentItem>(path.join(rawDir, file))
  const transcript = await readOptionalTranscript(path.join(transcriptDir, `${raw.id}.json`))
  if (transcript?.text) transcriptCount += 1
  const summary = heuristicSummary(raw, transcript?.text)
  await writeJson(path.join(summaryDir, `${summary.id}.json`), summary)
  count += 1
}
console.log(`Summarized ${count} item(s), ${transcriptCount} with transcript.`)

async function readOptionalTranscript(filePath: string) {
  try {
    return await readJson<TranscriptItem>(filePath)
  } catch {
    return undefined
  }
}
