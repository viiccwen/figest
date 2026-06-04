import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { extractEntitiesFromSegments } from '../../src/lib/entity-rules'
import type { ExtractedEntity, TopicSegment } from '../../src/lib/types'
import { ensureDirs, entityDir, readJson, segmentDir, writeJson } from '../shared'

await ensureDirs()

const files = await segmentFiles()
let itemCount = 0
let entityCount = 0

for (const file of files) {
  const segments = await readJson<TopicSegment[]>(path.join(segmentDir, file))
  const rawItemId = resolveRawItemId(segments, file)
  const entities = extractEntitiesFromSegments(segments)
  validateEntities(rawItemId, entities)
  await writeJson(path.join(entityDir, `${rawItemId}.json`), entities)
  itemCount += 1
  entityCount += entities.length
}

console.log(`Extracted ${entityCount} entity/entities from ${itemCount} segmented item(s).`)

async function segmentFiles(): Promise<string[]> {
  try {
    return (await readdir(segmentDir)).filter((file) => file.endsWith('.json')).sort()
  } catch {
    return []
  }
}

function resolveRawItemId(segments: TopicSegment[], file: string): string {
  const rawItemIds = uniqueSorted(segments.map((segment) => segment.rawItemId).filter(Boolean))
  if (rawItemIds.length === 1) return rawItemIds[0]
  if (rawItemIds.length > 1) throw new Error(`${file} contains multiple rawItemId values: ${rawItemIds.join(', ')}`)
  return path.basename(file, '.json')
}

function validateEntities(rawItemId: string, entities: ExtractedEntity[]): void {
  const keys = new Set<string>()
  for (const entity of entities) {
    const key = `${entity.canonicalName}\u0000${entity.ticker ?? ''}\u0000${entity.type}`
    if (keys.has(key)) throw new Error(`${rawItemId} has duplicate entity ${entity.canonicalName} (${entity.type}/${entity.ticker ?? ''})`)
    keys.add(key)

    if (entity.evidenceSegmentIds.length === 0) {
      throw new Error(`${rawItemId} entity ${entity.canonicalName} (${entity.type}/${entity.ticker ?? ''}) has no evidenceSegmentIds`)
    }
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}
