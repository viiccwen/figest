import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { financeGlossary, findMentionedAssets } from '../../src/lib/finance-glossary'
import type { NormalizedTranscriptArtifact, RawContentItem, RawTranscriptArtifact, TopicSegment, TranscriptItem, TranscriptSegment } from '../../src/lib/types'
import { ensureDirs, normalizedTranscriptDir, rawDir, rawTranscriptDir, readJson, segmentDir, transcriptDir, writeJson } from '../shared'

type InputArtifact = {
  kind: 'normalized' | 'raw' | 'legacy'
  transcript: RawTranscriptArtifact | NormalizedTranscriptArtifact
}

type SegmentDraft = {
  start?: number
  end?: number
  text: string
  speakerIds: string[]
}

const minChunkLength = 500
const targetChunkLength = 850
const maxChunkLength = 1200
const syntheticSegmentSeconds = 60
const syntheticSplitSeconds = 0.001

const majorMacroTerms = ['Fed', 'FED', 'CPI', 'PCE', 'FOMC', '聯準會', '美債殖利率', '美債收益率', '降息', '升息', '非農', '非農就業']

const topicKeywords: Array<{ topic: string; keywords: string[] }> = [
  { topic: '總體經濟', keywords: ['總體', '宏觀', '景氣', '經濟', 'GDP', '消費', '就業', '失業', '薪資'] },
  { topic: '央行政策', keywords: ['聯準會', 'Fed', 'FED', 'FOMC', '央行', '利率', '降息', '升息', '量化寬鬆', '縮表'] },
  { topic: '通膨', keywords: ['通膨', '通脹', 'CPI', 'PCE', '物價', '油價'] },
  { topic: '債券利率', keywords: ['美債殖利率', '美債收益率', '殖利率', '公債', '債券', '長債', '短債'] },
  { topic: '股市', keywords: ['股市', '標普', '那斯達克', '道瓊', '費半', '台股', '大盤', '指數', 'ETF'] },
  { topic: '科技股', keywords: ['科技股', 'AI', '半導體', '晶片', '輝達', '台積電', '伺服器'] },
  { topic: '外匯', keywords: ['匯率', '美元', '台幣', '日圓', '歐元', '人民幣'] },
  { topic: '商品能源', keywords: ['原油', '石油', '黃金', '銅', '天然氣', '布蘭特', '西德州'] },
  { topic: '地緣政治', keywords: ['關稅', '貿易戰', '川普', '中國', '伊朗', '戰爭', '制裁', '談判'] },
]

await ensureDirs()

const inputArtifacts = await collectInputArtifacts()
let segmentCount = 0
let transcriptCount = 0

for (const input of inputArtifacts) {
  const rawItem = await readOptionalRawItem(input.transcript.rawItemId)
  const drafts = buildSegmentDrafts(input.transcript)
  const segments = drafts.map((draft, index) => toTopicSegment(input.transcript, draft, index, rawItem?.title))
  await writeJson(path.join(segmentDir, `${input.transcript.id}.json`), segments)
  transcriptCount += 1
  segmentCount += segments.length
}

console.log(`Segmented ${transcriptCount} transcript(s) into ${segmentCount} topic segment(s).`)

async function collectInputArtifacts(): Promise<InputArtifact[]> {
  const normalized = await transcriptFiles(normalizedTranscriptDir)
  if (normalized.length > 0) {
    return Promise.all(normalized.map(async (file) => ({
      kind: 'normalized' as const,
      transcript: await readJson<NormalizedTranscriptArtifact>(path.join(normalizedTranscriptDir, file)),
    })))
  }

  const inputs: InputArtifact[] = []
  const seenIds = new Set<string>()

  for (const file of await transcriptFiles(rawTranscriptDir)) {
    const transcript = await readJson<RawTranscriptArtifact>(path.join(rawTranscriptDir, file))
    if (seenIds.has(transcript.id)) continue
    seenIds.add(transcript.id)
    inputs.push({ kind: 'raw', transcript })
  }

  for (const file of await transcriptFiles(transcriptDir)) {
    const legacyTranscript = await readJson<TranscriptItem>(path.join(transcriptDir, file))
    if (seenIds.has(legacyTranscript.id)) continue
    seenIds.add(legacyTranscript.id)
    inputs.push({ kind: 'legacy', transcript: legacyToRawTranscript(legacyTranscript) })
  }

  return inputs
}

async function transcriptFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith('.json')).sort()
  } catch {
    return []
  }
}

async function readOptionalRawItem(rawItemId: string): Promise<RawContentItem | undefined> {
  try {
    return await readJson<RawContentItem>(path.join(rawDir, `${rawItemId}.json`))
  } catch {
    return undefined
  }
}

function buildSegmentDrafts(transcript: RawTranscriptArtifact | NormalizedTranscriptArtifact): SegmentDraft[] {
  const sourceSegments = normalizeSourceSegments(transcript.segments.filter((segment) => segment.text.trim()))
  if (sourceSegments.length > 0) return mergeTranscriptSegments(sourceSegments)

  return splitTextIntoChunks(transcript.text).map((text, index) => ({
    start: index * syntheticSegmentSeconds,
    end: (index + 1) * syntheticSegmentSeconds,
    text,
    speakerIds: [],
  }))
}

function mergeTranscriptSegments(sourceSegments: TranscriptSegment[]): SegmentDraft[] {
  const drafts: SegmentDraft[] = []
  let current: TranscriptSegment[] = []
  let currentLength = 0

  for (const segment of sourceSegments) {
    const textLength = compactWhitespace(segment.text).length
    const wouldExceedMax = currentLength > 0 && currentLength + textLength > maxChunkLength
    const reachedTarget = currentLength >= targetChunkLength

    if (wouldExceedMax || reachedTarget) {
      drafts.push(combineTranscriptSegments(current))
      current = []
      currentLength = 0
    }

    if (textLength > maxChunkLength) {
      drafts.push(...splitTranscriptSegment(segment))
      continue
    }

    current.push(segment)
    currentLength += textLength
  }

  if (current.length > 0) drafts.push(combineTranscriptSegments(current))
  return normalizeDraftTimestamps(mergeTinyTail(drafts))
}

function normalizeSourceSegments(sourceSegments: TranscriptSegment[]): TranscriptSegment[] {
  let previousEnd = 0

  return [...sourceSegments]
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
    .map((segment) => {
      const rawStart = finiteTimestamp(segment.start, previousEnd)
      const rawEnd = finiteTimestamp(segment.end, rawStart)
      const start = Math.max(rawStart, previousEnd)
      const end = Math.max(rawEnd, start)
      previousEnd = end
      return { ...segment, start, end }
    })
}

function splitTranscriptSegment(segment: TranscriptSegment): SegmentDraft[] {
  const chunks = splitTextIntoChunks(segment.text)
  const duration = segment.end - segment.start
  const speakerIds = segment.speaker ? [segment.speaker] : []

  return chunks.map((text, index) => {
    if (duration > 0) {
      return {
        start: segment.start + (duration * index) / chunks.length,
        end: segment.start + (duration * (index + 1)) / chunks.length,
        text,
        speakerIds,
      }
    }

    const start = segment.start + index * syntheticSplitSeconds
    return {
      start,
      end: start + syntheticSplitSeconds,
      text,
      speakerIds,
    }
  })
}

function combineTranscriptSegments(segments: TranscriptSegment[]): SegmentDraft {
  return {
    start: Math.min(...segments.map((segment) => segment.start)),
    end: Math.max(...segments.map((segment) => segment.end)),
    text: compactWhitespace(segments.map((segment) => segment.text).join(' ')),
    speakerIds: uniqueSorted(segments.map((segment) => segment.speaker).filter((speaker): speaker is string => Boolean(speaker))),
  }
}

function splitTextIntoChunks(text: string): string[] {
  const sentences = compactWhitespace(text)
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap((sentence) => splitLongSentence(sentence))

  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current}${sentence}` : sentence
    if (current.length >= minChunkLength && next.length > maxChunkLength) {
      chunks.push(current)
      current = sentence
    } else {
      current = next
    }

    if (current.length >= targetChunkLength) {
      chunks.push(current)
      current = ''
    }
  }

  if (current) chunks.push(current)
  return mergeTinyTail(chunks.map((chunk, index) => ({ text: chunk, speakerIds: [], start: index * syntheticSegmentSeconds, end: (index + 1) * syntheticSegmentSeconds }))).map((chunk) => chunk.text)
}

function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= maxChunkLength) return [sentence]

  const chunks: string[] = []
  for (let index = 0; index < sentence.length; index += targetChunkLength) {
    chunks.push(sentence.slice(index, index + targetChunkLength))
  }
  return chunks
}

function mergeTinyTail(drafts: SegmentDraft[]): SegmentDraft[] {
  if (drafts.length < 2) return drafts

  const last = drafts[drafts.length - 1]
  const previous = drafts[drafts.length - 2]
  if (last.text.length >= minChunkLength || previous.text.length + last.text.length > maxChunkLength) return drafts

  return [
    ...drafts.slice(0, -2),
    {
      start: previous.start,
      end: last.end,
      text: compactWhitespace(`${previous.text} ${last.text}`),
      speakerIds: uniqueSorted([...previous.speakerIds, ...last.speakerIds]),
    },
  ]
}

function normalizeDraftTimestamps(drafts: SegmentDraft[]): SegmentDraft[] {
  let previousEnd = 0

  return drafts.map((draft, index) => {
    const fallbackStart = index * syntheticSegmentSeconds
    const rawStart = finiteTimestamp(draft.start, fallbackStart)
    const rawEnd = finiteTimestamp(draft.end, rawStart)
    const start = Math.max(rawStart, previousEnd)
    const end = Math.max(rawEnd, start)
    previousEnd = end
    return { ...draft, start, end }
  })
}

function toTopicSegment(
  transcript: RawTranscriptArtifact | NormalizedTranscriptArtifact,
  draft: SegmentDraft,
  index: number,
  rawTitle?: string,
): TopicSegment {
  const text = compactWhitespace(draft.text)
  const topics = detectTopics(text)
  const mentionedAssets = detectMentionedAssets(text)
  const importance = detectImportance(text, topics, mentionedAssets)

  return {
    id: `${transcript.id}-seg-${String(index + 1).padStart(3, '0')}`,
    rawItemId: transcript.rawItemId,
    sourceId: transcript.sourceId,
    title: buildSegmentTitle(rawTitle, topics, index),
    start: draft.start ?? index * syntheticSegmentSeconds,
    end: draft.end ?? (index + 1) * syntheticSegmentSeconds,
    text,
    speakerIds: draft.speakerIds,
    topics,
    mentionedAssets,
    importance,
  }
}

function detectTopics(text: string): string[] {
  const topics = new Set<string>()

  for (const entry of financeGlossary) {
    if (entry.type === 'asset') continue
    if (hasAnyKeyword(text, [entry.canonical, ...entry.aliases])) topics.add(entry.canonical)
  }

  for (const candidate of topicKeywords) {
    if (hasAnyKeyword(text, candidate.keywords)) topics.add(candidate.topic)
  }

  return [...topics].sort((a, b) => a.localeCompare(b))
}

function detectMentionedAssets(text: string): string[] {
  const assetNames = new Set(financeGlossary.filter((entry) => entry.type === 'asset').map((entry) => entry.canonical))
  return findMentionedAssets(text).filter((asset) => assetNames.has(asset)).sort((a, b) => a.localeCompare(b))
}

function detectImportance(text: string, topics: string[], mentionedAssets: string[]): TopicSegment['importance'] {
  if (mentionedAssets.length >= 2 || hasAnyKeyword(text, majorMacroTerms)) return 'high'
  if (mentionedAssets.length > 0 || topics.length > 0) return 'medium'
  return 'low'
}

function buildSegmentTitle(rawTitle: string | undefined, topics: string[], index: number): string {
  const prefix = rawTitle?.trim() || 'Transcript segment'
  const topicLabel = topics.slice(0, 2).join('、')
  return topicLabel ? `${prefix}｜${topicLabel}` : `${prefix}｜段落 ${index + 1}`
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const lowerText = text.toLocaleLowerCase()
  return keywords.some((keyword) => keyword && lowerText.includes(keyword.toLocaleLowerCase()))
}

function finiteTimestamp(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
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
