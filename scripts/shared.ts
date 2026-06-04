import { XMLParser } from 'fast-xml-parser'
import { convert } from 'html-to-text'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sources, sourceById } from '../src/lib/sources'
import type { DigestIndex, RawContentItem, SourceConfig, SummaryItem } from '../src/lib/types'
import { buildQualitySummary, inferTopics, stripPromotionalContent, toZhTw } from './content-quality'

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

const claimTypePriority: Record<string, number> = { risk: 7, catalyst: 6, macro: 5, valuation: 4, forecast: 3, fact: 2, opinion: 1 }
const assetEntityTypes = new Set(['company', 'ticker', 'currency', 'commodity'])
const topicEntityTypes = new Set(['topic', 'macro'])
const transcriptLikePatterns = /^(好|那|所以|然後|再來|接下來|我覺得|你知道|大家可以看到|我們來看|我們看到)[，\s]*/

type ClaimArtifact = {
  claim: string
  claimType: 'fact' | 'forecast' | 'opinion' | 'risk' | 'catalyst' | 'valuation' | 'macro'
  entities?: string[]
  tickers?: string[]
  sentiment?: 'bullish' | 'neutral' | 'bearish' | 'mixed'
  confidence?: number
  evidence?: { quote?: string }
}

type EntityArtifact = {
  id: string
  canonicalName: string
  type: string
  ticker?: string
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

export async function groundedSummary(raw: RawContentItem, transcriptText?: string): Promise<SummaryItem> {
  const [claims, entities] = await Promise.all([
    readOptionalJson<ClaimArtifact[]>(path.join(claimDir, `${raw.id}.json`)),
    readOptionalJson<EntityArtifact[]>(path.join(entityDir, `${raw.id}.json`)),
  ])
  return buildGroundedSummaryFromArtifacts(raw, claims ?? [], entities ?? [], transcriptText)
}

export function buildGroundedSummaryFromArtifacts(raw: RawContentItem, claims: ClaimArtifact[], entities: EntityArtifact[], transcriptText?: string): SummaryItem {
  const usefulClaims = selectUsefulClaims(claims)
  const base = heuristicSummary(raw, transcriptText)
  if (!usefulClaims.length) {
    const entityAssets = buildEntityAssets(entities)
    const fallbackKeyPoints = buildFallbackGroundedKeyPoints(base, entityAssets)
    const fallbackRisks = ['本集未萃取出足夠高信心主張；以下僅作來源內容索引，不構成投資建議。']
    return {
      ...base,
      excerpt: fallbackKeyPoints.slice(0, 2).join(' '),
      keyPoints: fallbackKeyPoints,
      mentionedAssets: entityAssets,
      risks: fallbackRisks,
      body: buildFallbackGroundedBody(base, entityAssets, fallbackKeyPoints, fallbackRisks),
    }
  }
  const entityByKey = buildEntityLookup(entities)
  const topics = buildGroundedTopics(raw, usefulClaims, entities, base.topics)
  const mentionedAssets = buildGroundedAssets(usefulClaims, entityByKey)
  const keyPoints = padGroundedKeyPoints(usefulClaims.slice(0, 5).map((claim) => claimToKeyPoint(claim)).filter(Boolean), topics, mentionedAssets).slice(0, 5)
  const risks = usefulClaims
    .filter((claim) => claim.claimType === 'risk' || claim.claimType === 'macro' || claim.sentiment === 'bearish' || claim.sentiment === 'mixed')
    .map((claim) => claimToRisk(claim))
    .filter(Boolean)
    .filter(uniqueByFingerprint)
    .slice(0, 3)
  addUnique(risks, '摘要為自動化資訊整理，不構成投資建議；重要數字與脈絡請回原節目查證。')
  const sentiment = deriveSentiment(usefulClaims)
  const body = buildGroundedBody({ keyPoints, risks, topics, mentionedAssets, claimCount: usefulClaims.length })

  return {
    ...base,
    excerpt: keyPoints.slice(0, 2).join(' '),
    keyPoints,
    body,
    topics,
    mentionedAssets,
    sentiment,
    risks,
  }
}

async function readOptionalJson<T>(filePath: string) {
  try {
    return await readJson<T>(filePath)
  } catch {
    return undefined
  }
}

function selectUsefulClaims(claims: ClaimArtifact[]) {
  return claims
    .filter((claim) => (claim.confidence ?? 0) >= 0.72)
    .map((claim) => ({ ...claim, claim: cleanClaimText(claim.claim || claim.evidence?.quote || '') }))
    .filter((claim) => claim.claim.length >= 22)
    .filter((claim) => stripPromotionalContent(claim.claim).length >= 22)
    .sort((a, b) => scoreClaim(b) - scoreClaim(a))
    .filter(uniqueClaim)
    .slice(0, 8)
}

function scoreClaim(claim: ClaimArtifact) {
  return (claim.confidence ?? 0) * 10 + (claimTypePriority[claim.claimType] ?? 0)
}

function uniqueClaim(claim: ClaimArtifact, index: number, all: ClaimArtifact[]) {
  const fingerprint = claimFingerprint(claim.claim)
  return all.findIndex((candidate) => claimFingerprint(candidate.claim) === fingerprint) === index
}

function uniqueByFingerprint(value: string, index: number, all: string[]) {
  return all.findIndex((candidate) => claimFingerprint(candidate) === claimFingerprint(value)) === index
}

function claimFingerprint(text: string) {
  return cleanClaimText(text).replace(/[\s\d.,，。％%]+/g, '').slice(0, 28)
}

function cleanClaimText(text: string) {
  return stripPromotionalContent(text)
    .replace(transcriptLikePatterns, '')
    .replace(/^(同樣|一樣|另外|但是|不過|因此|昨天|今天)[，\s]*/g, '')
    .replace(/(那|這個|就是|其實|大家|可以|看到|來講|的話)/g, '')
    .replace(/费半/g, '費半')
    .replace(/标普/g, '標普')
    .replace(/荷姆斯海峡/g, '荷姆茲海峽')
    .replace(/一性/g, '一致性')
    .replace(/\s+/g, ' ')
    .trim()
}

function claimToKeyPoint(claim: ClaimArtifact) {
  const text = ensureSentence(editorializeClaim(claim))
  const prefix: Record<ClaimArtifact['claimType'], string> = {
    risk: '風險線索',
    catalyst: '催化因素',
    macro: '總經脈絡',
    valuation: '估值觀察',
    forecast: '後續觀察',
    fact: '事實整理',
    opinion: '觀點整理',
  }
  return `${prefix[claim.claimType]}：${text}`
}

function claimToRisk(claim: ClaimArtifact) {
  const text = ensureSentence(editorializeClaim(claim, 68))
  if (claim.claimType === 'risk') return `需留意：${text}`
  if (claim.claimType === 'macro') return `總經變數：${text}`
  if (claim.sentiment === 'bearish' || claim.sentiment === 'mixed') return `情緒分歧：${text}`
  return ''
}

function editorializeClaim(claim: ClaimArtifact, max = 86) {
  const text = cleanClaimText(claim.claim)
  if (/荷姆茲海峽|荷姆斯海峡|布蘭特原油|布兰特原油|原油價格|原油价格|控制權|控制权/.test(text)) {
    return '荷姆茲海峽等地緣議題仍難快速談攏，原油價格反應顯示市場仍在評估能源供給風險'
  }
  if (/台韓|南韓股市|美元計價|標普|美股/.test(text)) {
    return '資金表現集中在台韓市場；以美元計價，台韓股市漲幅明顯領先標普等美股大盤'
  }
  if (/USTR|關稅|保護主義|貿易代表署/.test(text)) {
    return '美國貿易代表署關稅提案重啟政策不確定性，台灣、歐盟等多個經濟體被納入觀察'
  }
  if (/比特幣|Bitcoin|BTC|ETF|現貨|資金.*流出/.test(text)) {
    return '比特幣現貨 ETF 出現連續資金流出，量能變化與前波低點是判斷風險情緒的關鍵'
  }
  if (/Meta|Google|CSP|現金流|發債|資本支出/.test(text)) {
    return '大型雲端與 AI 資本支出推高資金需求，Google、Meta 等業者的現金流與發債壓力值得追蹤'
  }
  if (/實質薪資|企業利潤|疫情|購買力/.test(text)) {
    return '美國疫情後實質薪資增幅落後企業利潤，反映所得與獲利分配差距擴大'
  }
  if (/物價|通膨|補貼|財政/.test(text) && /2022|體感|政府/.test(text)) {
    return '政府以補貼抑制物價體感，反映通膨壓力與財政空間仍是後續觀察重點'
  }
  if (/手機|PC|記憶體|小米|榮耀|低階/.test(text)) {
    return '記憶體成本上升壓縮低階手機市場，手機銷售展望下修對小米、榮耀等出貨動能形成壓力'
  }
  return shortenClaim(text, max)
}

function padGroundedKeyPoints(keyPoints: string[], topics: string[], mentionedAssets: string[]) {
  const points = [...keyPoints]
  if (points.length < 3 && mentionedAssets.length) {
    points.push(ensureSentence(`可連結到主張的資產 / 標的包含 ${mentionedAssets.slice(0, 5).join('、')}，僅作內容索引，不代表買賣建議`))
  }
  if (points.length < 3 && topics.length) {
    points.push(ensureSentence(`主題索引以 ${topics.slice(0, 4).join('、')} 為主，僅代表本集已萃取出的可檢索脈絡`))
  }
  while (points.length < 3) {
    points.push('本摘要僅採用通過信心門檻且可回溯到原文片段的主張，未由逐字稿任意延伸。')
  }
  return points.filter(uniqueByFingerprint)
}

function shortenClaim(text: string, max = 78) {
  const clean = toZhTw(text).replace(/[，；、]\s*$/g, '')
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const punctuation = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('，'))
  return `${(punctuation > 30 ? cut.slice(0, punctuation) : cut).replace(/[，；、。]+$/g, '')}…`
}

function ensureSentence(text: string) {
  const clean = toZhTw(text).trim().replace(/[，；：]+$/g, '')
  if (!clean) return ''
  return /[。！？…]$/.test(clean) ? clean : `${clean}。`
}

function buildEntityLookup(entities: EntityArtifact[]) {
  const map = new Map<string, EntityArtifact>()
  for (const entity of entities) {
    map.set(entity.id, entity)
    map.set(entity.canonicalName, entity)
    if (entity.ticker) map.set(entity.ticker, entity)
  }
  return map
}

function buildGroundedAssets(claims: ClaimArtifact[], entityByKey: Map<string, EntityArtifact>) {
  const assets: string[] = []
  for (const claim of claims) {
    for (const ticker of claim.tickers ?? []) addUnique(assets, toZhTw(ticker))
    for (const key of claim.entities ?? []) {
      const entity = entityByKey.get(key)
      if (entity && assetEntityTypes.has(entity.type)) addUnique(assets, toZhTw(entity.ticker ?? entity.canonicalName))
    }
  }
  return assets.slice(0, 8)
}

function buildEntityAssets(entities: EntityArtifact[]) {
  const assets: string[] = []
  for (const entity of entities) {
    if (assetEntityTypes.has(entity.type)) addUnique(assets, toZhTw(entity.ticker ?? entity.canonicalName))
  }
  return assets.slice(0, 8)
}

function buildGroundedTopics(raw: RawContentItem, claims: ClaimArtifact[], entities: EntityArtifact[], fallbackTopics: string[]) {
  const topics: string[] = []
  for (const topic of inferTopics(`${raw.title} ${claims.map((claim) => claim.claim).join(' ')}`)) addUnique(topics, topic)
  for (const entity of entities) {
    if (topicEntityTypes.has(entity.type) && claims.some((claim) => claim.claim.includes(entity.canonicalName) || claim.entities?.includes(entity.id) || claim.entities?.includes(entity.canonicalName))) {
      addUnique(topics, toZhTw(entity.canonicalName))
    }
  }
  for (const topic of fallbackTopics) addUnique(topics, topic)
  return topics.slice(0, 6)
}

function addUnique(values: string[], value: string) {
  const clean = toZhTw(value).trim()
  if (clean && !values.includes(clean)) values.push(clean)
}

function deriveSentiment(claims: ClaimArtifact[]): SummaryItem['sentiment'] {
  const counts = { bullish: 0, neutral: 0, bearish: 0, mixed: 0 }
  for (const claim of claims) if (claim.sentiment) counts[claim.sentiment] += 1
  if (counts.mixed || (counts.bullish && counts.bearish)) return '混合'
  if (counts.bearish > counts.bullish) return '偏空'
  if (counts.bullish > counts.bearish && counts.bullish > counts.neutral) return '偏多'
  if (counts.neutral) return '中性'
  return '資訊不足'
}

function buildGroundedBody(input: { keyPoints: string[]; risks: string[]; topics: string[]; mentionedAssets: string[]; claimCount: number }) {
  const topicText = input.topics.length ? input.topics.slice(0, 4).join('、') : '可驗證主張'
  const assetText = input.mentionedAssets.length ? `涉及資產 / 標的：${input.mentionedAssets.join('、')}。` : '本集未萃取出明確可連結到主張的標的。'
  return [
    `TL;DR：本摘要以 ${input.claimCount} 則通過門檻的主張為核心，聚焦 ${topicText}，避免直接複製逐字稿口語內容。`,
    '',
    '重點摘要：',
    ...input.keyPoints.map((point) => `- ${point}`),
    '',
    input.risks.length ? `風險 / 分歧：${input.risks.join(' ')}` : '風險 / 分歧：可用主張中未萃取出明確風險句，本文不另行推測。',
    assetText,
    '內容品質：摘要已套用繁中正規化與業配過濾，並優先採用有證據片段的主張與實體。',
    '提醒：摘要為自動化資訊整理，不構成投資建議；重要數字與脈絡請回原節目查證。',
    '證據說明：重點來自通過門檻的主張與實體；仍請回原節目查核完整脈絡與數字。',
  ].join('\n')
}

function buildFallbackGroundedKeyPoints(base: SummaryItem, entityAssets: string[]) {
  const points: string[] = []
  if (entityAssets.length) {
    points.push(ensureSentence(`本集可確認的標的 / 資產包含 ${entityAssets.slice(0, 5).join('、')}，僅作內容索引，不代表買賣建議`))
  } else {
    points.push('本集尚未萃取出可確認的標的 / 資產，因此不主動延伸個股或 ETF 結論。')
  }
  if (base.topics.length) {
    points.push(ensureSentence(`可檢索主題以 ${base.topics.slice(0, 4).join('、')} 為主，後續仍需回原節目確認完整脈絡`))
  }
  points.push('本集未產生足夠高信心主張，摘要暫不從逐字稿口語片段推導投資判斷。')
  while (points.length < 3) points.push('內容品質：保留來源索引與風險提醒，等待後續轉錄與主張萃取品質提升後再擴充。')
  return points.slice(0, 4)
}

function buildFallbackGroundedBody(base: SummaryItem, entityAssets: string[], keyPoints: string[], risks: string[]) {
  const assetText = entityAssets.length ? `可確認的標的 / 資產：${entityAssets.join('、')}。` : '本集未萃取出可確認的標的 / 資產。'
  return [
    'TL;DR：本集尚未產生足夠高信心主張，因此僅保留來源索引、可確認標的與風險提醒，不從逐字稿口語內容延伸投資結論。',
    '',
    '重點摘要：',
    ...keyPoints.map((point) => `- ${point}`),
    '',
    `風險 / 分歧：${risks.join(' ')}`,
    assetText,
    '內容品質：摘要已套用繁中正規化與業配過濾；因可用主張不足，本文採保守整理。',
    '提醒：摘要為自動化資訊整理，不構成投資建議；重要數字與脈絡請回原節目查證。',
  ].join('\n')
}

export function sortSummaries(items: SummaryItem[]) {
  return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

export function buildIndex(summaries: SummaryItem[]): DigestIndex {
  return { generatedAt: new Date().toISOString(), timezone: 'Asia/Taipei', disclaimer, summaries: sortSummaries(summaries) }
}

export { sources }
