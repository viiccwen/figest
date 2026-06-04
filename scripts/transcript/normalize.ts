import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { collectCorrections, normalizeFinanceTerms } from '../../src/lib/finance-glossary'
import type { NormalizedTranscriptArtifact, RawTranscriptArtifact, TranscriptItem, TranscriptSegment } from '../../src/lib/types'
import { ensureDirs, normalizedTranscriptDir, rawTranscriptDir, readJson, transcriptDir, writeJson } from '../shared'

type InputArtifact = {
  kind: 'raw' | 'legacy'
  rawTranscript: RawTranscriptArtifact
}

await ensureDirs()

const inputArtifacts = await collectInputArtifacts()

let normalizedCount = 0
let correctionCount = 0
let rawCount = 0
let legacyCount = 0

for (const input of inputArtifacts) {
  const rawTranscript = input.rawTranscript
  const sourceTextForCorrections = rawTranscript.text.trim() || rawTranscript.segments.map((segment) => segment.text).join('\n')
  const corrections = collectCorrections(sourceTextForCorrections)
  const outputPath = path.join(normalizedTranscriptDir, `${rawTranscript.id}.json`)
  const existing = await readExistingNormalizedTranscript(outputPath)
  const normalizedText = normalizeFinanceTerms(rawTranscript.text)
  const normalizedSegments = rawTranscript.segments.map(normalizeSegment)
  const normalized: NormalizedTranscriptArtifact = {
    ...rawTranscript,
    text: normalizedText,
    segments: normalizedSegments,
    normalizedAt: existing && hasSameNormalizedContent(existing, normalizedText, normalizedSegments, corrections) ? existing.normalizedAt : new Date().toISOString(),
    corrections,
  }

  await writeJson(outputPath, normalized)
  normalizedCount += 1
  correctionCount += corrections.reduce((sum, correction) => sum + correction.count, 0)
  if (input.kind === 'raw') rawCount += 1
  else legacyCount += 1
}

console.log(`Normalized ${normalizedCount} transcript(s) from ${rawCount} raw and ${legacyCount} legacy artifact(s) with ${correctionCount} glossary correction(s).`)

async function collectInputArtifacts(): Promise<InputArtifact[]> {
  const inputs: InputArtifact[] = []
  const rawIds = new Set<string>()

  for (const file of await transcriptFiles(rawTranscriptDir)) {
    const rawTranscript = await readJson<RawTranscriptArtifact>(path.join(rawTranscriptDir, file))
    if (rawIds.has(rawTranscript.id)) continue
    rawIds.add(rawTranscript.id)
    inputs.push({ kind: 'raw', rawTranscript })
  }

  for (const file of await transcriptFiles(transcriptDir)) {
    const legacyTranscript = await readJson<TranscriptItem>(path.join(transcriptDir, file))
    if (rawIds.has(legacyTranscript.id)) continue
    rawIds.add(legacyTranscript.id)
    inputs.push({ kind: 'legacy', rawTranscript: legacyToRawTranscript(legacyTranscript) })
  }

  return inputs
}

async function transcriptFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file: string) => file.endsWith('.json')).sort()
  } catch {
    return []
  }
}

function normalizeSegment(segment: TranscriptSegment): TranscriptSegment {
  return {
    ...segment,
    text: normalizeFinanceTerms(segment.text),
  }
}

async function readExistingNormalizedTranscript(filePath: string): Promise<NormalizedTranscriptArtifact | undefined> {
  try {
    return await readJson<NormalizedTranscriptArtifact>(filePath)
  } catch {
    return undefined
  }
}

function hasSameNormalizedContent(
  existing: NormalizedTranscriptArtifact,
  text: string,
  segments: TranscriptSegment[],
  corrections: NormalizedTranscriptArtifact['corrections'],
) {
  return existing.text === text && jsonEqual(existing.segments, segments) && jsonEqual(existing.corrections, corrections)
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function legacyToRawTranscript(transcript: TranscriptItem): RawTranscriptArtifact {
  return {
    id: transcript.id,
    rawItemId: transcript.rawItemId,
    sourceId: transcript.sourceId,
    provider: 'legacy-transcript',
    model: transcript.model,
    language: transcript.language,
    transcribedAt: transcript.transcribedAt,
    audioUrl: transcript.audioUrl,
    segments: [],
    text: transcript.text,
    warnings: [],
  }
}
