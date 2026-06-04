import path from 'node:path'
import { ensureDirs, parseSource, rawDir, sources, writeJson } from './shared'

const limitArg = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 3)
const onlySource = process.argv.find((arg) => arg.startsWith('--source='))?.split('=')[1]

await ensureDirs()
const selected = onlySource ? sources.filter((source) => source.id === onlySource || source.slug === onlySource) : sources
const allItems = []
for (const source of selected) {
  try {
    const items = await parseSource(source, limitArg)
    for (const item of items) {
      await writeJson(path.join(rawDir, `${item.id}.json`), item)
      allItems.push(item)
    }
    console.log(`✓ ${source.name}: ${items.length} item(s)`)
  } catch (error) {
    console.error(`✗ ${source.name}:`, error instanceof Error ? error.message : error)
  }
}
console.log(`Ingested ${allItems.length} item(s).`)
