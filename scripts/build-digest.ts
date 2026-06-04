import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { SummaryItem } from '../src/lib/types'
import { buildIndex, ensureDirs, generatedDir, publicDataDir, readJson, summaryDir, writeJson } from './shared'

await ensureDirs()
const files = (await readdir(summaryDir)).filter((file) => file.endsWith('.json'))
const summaries = await Promise.all(files.map((file) => readJson<SummaryItem>(path.join(summaryDir, file))))
const index = buildIndex(summaries)
await writeJson(path.join(generatedDir, 'index.json'), index)
await writeJson(path.join(publicDataDir, 'index.json'), index)
console.log(`Built digest index with ${index.summaries.length} summary item(s).`)
