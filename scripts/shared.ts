import { XMLParser } from 'fast-xml-parser'
import { convert } from 'html-to-text'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sources, sourceById } from '../src/lib/sources'
import type { DigestIndex, RawContentItem, SourceConfig, SummaryItem } from '../src/lib/types'
import { buildQualitySummary, toZhTw } from './content-quality'

export const rootDir = process.cwd()
export const rawDir = path.join(rootDir, 'content/raw/items')
export const audioManifestDir = path.join(rootDir, 'content/audio-manifests/items')
export const transcriptDir = path.join(rootDir, 'content/transcripts/items')
export const rawTranscriptDir = path.join(rootDir, 'content/transcripts/raw')
export const normalizedTranscriptDir = path.join(rootDir, 'content/transcripts/normalized')
export const segmentDir = path.join(rootDir, 'content/segments/items')
export const entityDir = path.join(rootDir, 'content/entities/items')
export const claimDir = path.join(rootDir, 'content/claims/items')
export const insightDir = path.join(rootDir, 'content/insights/items')
export const summaryDir = path.join(rootDir, 'content/summaries/items')
export const generatedDir = path.join(rootDir, 'src/data/generated')
export const publicDataDir = path.join(rootDir, 'public/data/summaries')
export const disclaimer = '本網站摘要由 AI 自動生成，僅供資訊整理與學習參考，不構成投資建議；請以原始節目內容與正式資訊為準。'

export async function ensureDirs() {
  await Promise.all(
    [
      rawDir,
      audioManifestDir,
      transcriptDir,
      rawTranscriptDir,
      normalizedTranscriptDir,
      segmentDir,
      entityDir,
      claimDir,
      insightDir,
      summaryDir,
      generatedDir,
      publicDataDir,
    ].map((dir) => mkdir(dir, { recursive: true })),
  )
}

export async function writeJson(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

export async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/https?:\/\//g, '').replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export function cleanText(value = '') {
  return convert(value, { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: true } }] }).replace(/\s+/g, ' ').trim()
}

function itemArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function textValue(value: unknown) {
  if (value && typeof value === 'object' && '#text' in value) return String((value as Record<string, unknown>)['#text'])
  return value == null ? '' : String(value)
}

export async function fetchFeed(source: SourceConfig) {
  const urls = [source.feedUrl, ...(source.fallbackFeedUrls ?? [])]
  const errors: string[] = []
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 finance-digest/0.1' } })
        if (!response.ok) throw new Error(`${response.status}`)
        const xml = await response.text()
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })
        return parser.parse(xml)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${url} attempt ${attempt}: ${message}`)
        await new Promise((resolve) => setTimeout(resolve, attempt * 400))
      }
    }
  }
  throw new Error(`Fetch failed for ${source.name}: ${errors.join('; ')}`)
}

export async function parseSource(source: SourceConfig, limit = 5): Promise<RawContentItem[]> {
  const parsed = await fetchFeed(source)
  const fetchedAt = new Date().toISOString()
  if (source.kind === 'podcast-rss' || parsed.rss?.channel?.item) {
    return itemArray(parsed.rss?.channel?.item).slice(0, limit).map((value: unknown) => {
      const item = asRecord(value)
      const enclosure = asRecord(item.enclosure)
      const image = asRecord(item['itunes:image'])
      const externalId = textValue(item.guid || item.link || item.title)
      const publishedAt = new Date(String(item.pubDate || fetchedAt)).toISOString()
      const id = `${source.id}-${publishedAt.slice(0, 10)}-${slugify(externalId)}`
      return {
        id,
        sourceId: source.id,
        externalId,
        medium: 'podcast',
        title: String(item.title || 'Untitled episode'),
        description: cleanText(String(item.description || item['content:encoded'] || '')),
        publishedAt,
        url: String(item.link || source.homepage),
        audioUrl: textValue(enclosure['@_url']) || undefined,
        imageUrl: textValue(image['@_href']) || undefined,
        fetchedAt,
      }
    })
  }

  return itemArray(parsed.feed?.entry).slice(0, limit).map((value: unknown) => {
    const entry = asRecord(value)
    const externalId = String(entry['yt:videoId'] || entry.id || entry.title)
    const publishedAt = new Date(String(entry.published || entry.updated || fetchedAt)).toISOString()
    const id = `${source.id}-${publishedAt.slice(0, 10)}-${slugify(externalId)}`
    const media = asRecord(entry['media:group'])
    const link = asRecord(entry.link)
    const thumbnail = asRecord(media['media:thumbnail'])
    return {
      id,
      sourceId: source.id,
      externalId,
      medium: 'youtube',
      title: String(entry.title || 'Untitled video'),
      description: cleanText(String(media['media:description'] || '')),
      publishedAt,
      url: String(link['@_href'] || `https://www.youtube.com/watch?v=${externalId}`),
      imageUrl: textValue(thumbnail['@_url']) || undefined,
      fetchedAt,
    }
  })
}

export function heuristicSummary(raw: RawContentItem, transcriptText?: string): SummaryItem {
  const source = sourceById(raw.sourceId)
  const sourceName = source?.name ?? raw.sourceId
  const sourceSlug = source?.slug ?? raw.sourceId
  const hasTranscript = Boolean(transcriptText?.trim())
  const quality = buildQualitySummary(raw, transcriptText)
  const sourceTextQuality = hasTranscript ? 'transcript' : quality.cleanedText.length > 240 ? 'show-notes' : 'metadata-only'
  const risks = hasTranscript
    ? ['逐字稿由 Whisper API 產生，仍可能有聽寫錯誤或斷句誤差。', '財經節目內容常含主持人觀點與情境討論，請勿視為買賣建議。']
    : ['目前資料來源可能只有標題與 show notes，摘要完整度有限。', '財經節目內容常含主持人觀點與情境討論，請勿視為買賣建議。']
  return {
    id: raw.id,
    sourceId: raw.sourceId,
    sourceName,
    sourceSlug,
    title: toZhTw(raw.title),
    url: raw.url,
    publishedAt: raw.publishedAt,
    summarizedAt: new Date().toISOString(),
    excerpt: quality.excerpt,
    keyPoints: quality.keyPoints,
    body: quality.body,
    topics: quality.topics,
    mentionedAssets: quality.mentionedAssets,
    sentiment: '資訊不足',
    risks,
    sourceTextQuality,
  }
}

export function sortSummaries(items: SummaryItem[]) {
  return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

export function buildIndex(summaries: SummaryItem[]): DigestIndex {
  return { generatedAt: new Date().toISOString(), timezone: 'Asia/Taipei', disclaimer, summaries: sortSummaries(summaries) }
}

export { sources }
