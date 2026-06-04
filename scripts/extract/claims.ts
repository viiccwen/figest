import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ExtractedClaim, ExtractedEntity, TopicSegment } from '../../src/lib/types'
import { claimDir, ensureDirs, entityDir, readJson, segmentDir, writeJson } from '../shared'

type ClaimType = ExtractedClaim['claimType']
type Sentiment = ExtractedClaim['sentiment']

type CandidateQuote = {
  quote: string
  index: number
}

type ScoredCandidate = CandidateQuote & {
  quoteEntities: ExtractedEntity[]
  score: number
}

const claimTypeRules: Array<{ type: ClaimType; keywords: RegExp[] }> = [
  { type: 'forecast', keywords: [/可能[會会要]|預期|预期|估計|估计|展望|預測|预测|將會|将会|看好|看壞|看坏/] },
  { type: 'risk', keywords: [/風險|风险|下滑|衰退|壓力|压力|不確定|不确定|虧損|亏损|警訊|警讯/] },
  { type: 'catalyst', keywords: [/催化|受惠|帶動|带动|推升|利多|利空|事件/] },
  { type: 'valuation', keywords: [/估值|本益比|\bPE\b|股價|股价|目標價|目标价|便宜|昂貴|昂贵/i] },
  { type: 'macro', keywords: [/\bFed\b|\bCPI\b|\bPCE\b|\bFOMC\b|非農|非农|利率|通膨|通脹|通胀|美債|美债|美元|降息|升息/i] },
  { type: 'opinion', keywords: [/我認為|我认为|我覺得|我觉得|看法|觀點|观点/] },
]

const claimKeywordPatterns = claimTypeRules.flatMap((rule) => rule.keywords)
const macroTopicPattern = /總經|总经|宏觀|宏观|Fed|CPI|PCE|FOMC|非農|非农|GDP|PMI|利率|通膨|通脹|通胀|美債|美债|公債|公债|殖利率|美元|外匯|外汇|匯率|汇率|降息|升息|原油|黃金|黄金|關稅|关税|景氣|衰退/i
const financeMarketKeywordPattern = /總經|总经|宏觀|宏观|Fed|CPI|PCE|FOMC|非農|非农|GDP|PMI|利率|通膨|通脹|通胀|美債|美债|公債|公债|殖利率|美元|外匯|外汇|匯率|汇率|降息|升息|原油|黃金|黄金|商品能源|關稅|关税|股市|市場|市场|大盤|大盘|科技股|半導體|半导体|晶片|芯片|投資|投资|基金|ETF|債券|债券|股票|股價|股价|財報|财报|營收|营收|獲利|获利|盈利|毛利|成本|供應鏈|供应链|訂單|订单|需求|庫存|库存|估值|本益比|目標價|目标价|IPO|併購|并购|期貨|期货|選擇權|选择权|資金|资金|景氣|衰退|利多|利空|風險|风险/i
const assertionKeywordPattern = /可能[會会要]|預期|预期|估計|估计|展望|預測|预测|將會|将会|看好|看壞|看坏|風險|风险|下滑|衰退|壓力|压力|不確定|不确定|虧損|亏损|警訊|警讯|催化|受惠|帶動|带动|推升|利多|利空|估值|本益比|股價|股价|目標價|目标价|便宜|昂貴|昂贵|上漲|上涨|漲|涨|下跌|跌|下挫|創高|创高|創低|创低|買|买|賣|卖|投資|投资|殖利率|利率|通膨|通脹|通胀|降息|升息|匯率|汇率|美元|原油|黃金|黄金|市場|市场|資金|资金|ETF|期貨|期货|選擇權|选择权|課征|课征|加徵|加征|公布|通過|通过|表態|表态|表示|認為|认为|指出|提升|降低|增加|減少|减少|成長|成长|衰退|反彈|反弹|回落|突破|受惠|帶動|带动|推升|壓力|压力|下滑|創高|创高|創低|创低/i
const marketActionKeywordPattern = /財報|财报|營收|营收|獲利|获利|盈利|毛利|成本|供應鏈|供应链|訂單|订单|需求|庫存|库存|股價|股价|漲|涨|跌|買|买|賣|卖|投資|投资|估值|本益比|殖利率|利率|通膨|通脹|通胀|降息|升息|匯率|汇率|美元|原油|黃金|黄金|市場|市场|資金|资金|ETF|期貨|期货|選擇權|选择权|風險|风险|衰退|利多|利空|受惠|帶動|带动|推升|壓力|压力|成長|成长|下滑|創高|创高|創低|创低|目標價|目标价|上漲|上涨|下跌|下挫|反彈|反弹|回落|突破/i
const specificMarketActionKeywordPattern = /財報|财报|營收|营收|獲利|获利|盈利|毛利|成本|供應鏈|供应链|訂單|订单|需求|庫存|库存|股價|股价|漲|涨|跌|買|买|賣|卖|估值|本益比|殖利率|利率|通膨|通脹|通胀|降息|升息|匯率|汇率|美元|原油|黃金|黄金|資金|资金|ETF|期貨|期货|選擇權|选择权|衰退|利多|利空|受惠|帶動|带动|推升|壓力|压力|成長|成长|下滑|創高|创高|創低|创低|目標價|目标价|上漲|上涨|下跌|下挫|反彈|反弹|回落|突破/i
const anecdoteDenyPattern = /聽眾|听众|來信|来信|留言|投稿|問答|闲聊|閒聊|聊天|開玩笑|开玩笑|笑死|哈哈|呵呵|大家好|晚安|早安|退休|養老|养老|年金|小孩|孩子|兒子|儿子|女兒|女儿|老婆|老公|家人|家庭|學校|学校|上班|辭職|辞职|NBA|MLB|寶可夢|宝可梦|Pokemon|Pokémon|跑步機|跑步机|健身|運動|运动|音樂|音乐|唱歌|歌曲|遊戲|游戏|電玩|电玩|精靈|精灵|紅酒|红酒|喝酒|啤酒|夜市|美食|餐廳|餐厅|吃飯|吃饭|粉絲|粉丝|見面會|见面会|大頭貼|大头贴|貓|猫|狗|寵物|宠物|Netflix|影集|鬼片|怕老婆/i
const hardDenyPattern = /優惠碼|优惠码|結帳|结账|折扣|退款保證|退款保证|不滿意|不满意|方案加送|訂閱|订阅|贊助|赞助|業配|业配|顏值|颜值|植村秀|妝容|妆容|小紅噴|小红喷|暗沉|出油|出汗|保養|保养|保濕|保湿|下面一位|五星推|生日快樂|生日快乐|通勤時間|通勤时间|帶大家飛|带大家飞|問你平常|问你平常|Fucking|fuck|狗屎|屎|性交/i
const selfReferentialBanterPattern = /節目|节目|分享|題材|题材|故事|我覺得|我觉得|我認為|我认为|自己認為|自己认为|老實講|老实讲|說實在|说实在|大家講|大家讲|你懂|你知道|講出來|讲出来|接下來|接下来|進入市場|进入市场|進入話題|进入话题|生活重心|開心|开心|陪伴各位|陪伴着各位/i
const bullishPattern = /上漲|上涨|漲幅|涨幅|創高|创高|推升|受惠|利多|看好|回彈|回弹|提升|成長|成长|復甦|复苏|改善|突破|高位|健康|正常|便宜/i
const bearishPattern = /下跌|下挫|下滑|衰退|壓力|压力|虧損|亏损|利空|看壞|看坏|風險|风险|不確定|不确定|警訊|警讯|卡關|卡关|失敗|失败|反對|反对|昂貴|昂贵/i
const punctuationSplitPattern = /(?<=[。！？；;.!?])\s*|[\r\n]+/u
const minimumQuoteLength = 18
const maximumQuoteLength = 120
const maxClaimsPerSegment = 1

await ensureDirs()

const files = await segmentFiles()
let itemCount = 0
let claimCount = 0

for (const file of files) {
  const segments = await readJson<TopicSegment[]>(path.join(segmentDir, file))
  const rawItemId = resolveRawItemId(segments, file)
  const entities = await readOptionalEntities(rawItemId)
  const claims = extractClaims(rawItemId, segments, entities)
  validateClaims(rawItemId, segments, claims)
  await writeJson(path.join(claimDir, `${rawItemId}.json`), claims)
  itemCount += 1
  claimCount += claims.length
}

console.log(`Extracted ${claimCount} claim(s) from ${itemCount} segmented item(s).`)

async function segmentFiles(): Promise<string[]> {
  try {
    return (await readdir(segmentDir)).filter((file: string) => file.endsWith('.json')).sort()
  } catch {
    return []
  }
}

async function readOptionalEntities(rawItemId: string): Promise<ExtractedEntity[]> {
  try {
    return await readJson<ExtractedEntity[]>(path.join(entityDir, `${rawItemId}.json`))
  } catch {
    return []
  }
}

function extractClaims(rawItemId: string, segments: TopicSegment[], entities: ExtractedEntity[]): ExtractedClaim[] {
  const claims: ExtractedClaim[] = []
  const usedQuotesBySegment = new Map<string, Set<string>>()

  for (const segment of segments) {
    const segmentEntities = entities.filter((entity) => entity.evidenceSegmentIds.includes(segment.id))
    const candidates = candidateQuotes(segment.text, segmentEntities)
    const usedQuotes = usedQuotesBySegment.get(segment.id) ?? new Set<string>()
    usedQuotesBySegment.set(segment.id, usedQuotes)
    const selectedCandidates: ScoredCandidate[] = []

    for (const candidate of candidates) {
      const quote = candidate.quote.trim()
      if (!quote || usedQuotes.has(quote)) continue

      const quoteEntities = entitiesForQuote(quote, segmentEntities)
      if (!hasStrongFinanceSignal(quote, quoteEntities)) continue
      if (isNearDuplicateQuote(quote, usedQuotes) || selectedCandidates.some((selected) => areSimilarQuotes(quote, selected.quote))) continue

      selectedCandidates.push({ ...candidate, quote, quoteEntities, score: scoreCandidate(quote, quoteEntities) })
    }

    const chosenCandidates = selectedCandidates
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxClaimsPerSegment)
      .sort((a, b) => a.index - b.index)

    for (const candidate of chosenCandidates) {
      const quote = candidate.quote.trim()
      const quoteEntities = candidate.quoteEntities
      const entitiesForClaim = quoteEntities
      if (entitiesForClaim.length === 0 && !macroTopicPattern.test(quote)) continue
      const tickers = uniqueSorted(entitiesForClaim.flatMap((entity) => entity.ticker ? [entity.ticker] : []))
      const claim: ExtractedClaim = {
        id: `${rawItemId}-claim-${String(claims.length + 1).padStart(3, '0')}`,
        rawItemId,
        segmentId: segment.id,
        claim: quote,
        claimType: classifyClaimType(quote, segment),
        entities: uniqueSorted(entitiesForClaim.map((entity) => entity.canonicalName)),
        tickers,
        sentiment: classifySentiment(quote),
        confidence: scoreConfidence(quote, segment, quoteEntities, segmentEntities),
        evidence: {
          start: segment.start,
          end: segment.end,
          quote,
        },
      }
      claims.push(claim)
      usedQuotes.add(quote)
    }
  }

  return claims
}

function candidateQuotes(text: string, segmentEntities: ExtractedEntity[]): CandidateQuote[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const directParts = trimmed
    .split(punctuationSplitPattern)
    .map((part) => part.trim())
    .filter((part) => part.length >= minimumQuoteLength)

  const parts = directParts.length > 0 ? directParts : [trimmed]
  const candidates: CandidateQuote[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const partIndex = text.indexOf(part)
    const quoteParts = part.length <= maximumQuoteLength
      ? [focusQuoteAroundAnchor(part, segmentEntities)]
      : focusedWindows(part, segmentEntities)
    for (const quotePart of quoteParts) {
      const quote = quotePart.trim()
      if (quote.length < minimumQuoteLength || seen.has(quote)) continue
      candidates.push({ quote, index: Math.max(0, partIndex + part.indexOf(quote)) })
      seen.add(quote)
    }
  }

  return candidates.sort((a, b) => a.index - b.index)
}

function focusedWindows(text: string, segmentEntities: ExtractedEntity[]): string[] {
  const signalPattern = buildWindowAnchorPattern(segmentEntities)
  const windows: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = signalPattern.exec(text)) !== null) {
    const start = Math.max(0, match.index - 20)
    const end = Math.min(text.length, match.index + match[0].length + 95)
    const quote = trimToReasonableClause(text.slice(start, end))
    if (quote.length >= minimumQuoteLength && !seen.has(quote)) {
      windows.push(quote)
      seen.add(quote)
    }
    if (windows.length >= maxClaimsPerSegment * 2) break
  }

  return windows
}

function buildWindowAnchorPattern(segmentEntities: ExtractedEntity[]): RegExp {
  const entityAnchors = segmentEntities
    .flatMap((entity) => [entity.canonicalName, entity.ticker, ...entity.aliases])
    .filter((value): value is string => Boolean(value))
    .map(escapeRegExp)
  const anchorSource = uniqueSorted([assertionKeywordPattern.source, marketActionKeywordPattern.source, ...entityAnchors, financeMarketKeywordPattern.source])
    .filter(Boolean)
    .join('|')
  return new RegExp(anchorSource, 'giu')
}

function trimToReasonableClause(value: string): string {
  return value
    .replace(/^[，,、：:；;。！？!?.\s]+/u, '')
    .replace(/^\d+(?:\.\d+)?%?(?:但|不過|不过|當然|当然)?/u, '')
    .replace(/^[，,、：:；;。！？!?.\s]+/u, '')
    .replace(/[，,、：:；;\s]+$/u, '')
    .trim()
}

function focusQuoteAroundAnchor(text: string, segmentEntities: ExtractedEntity[]): string {
  const trimmed = trimToReasonableClause(text)
  if (trimmed.length <= 100) return trimmed

  const anchorPattern = buildWindowAnchorPattern(segmentEntities)
  const match = anchorPattern.exec(trimmed)
  if (!match) return ''

  const start = Math.max(0, match.index - 20)
  const end = Math.min(trimmed.length, match.index + match[0].length + 95)
  return trimToReasonableClause(trimmed.slice(start, end))
}

function hasStrongFinanceSignal(quote: string, quoteEntities: ExtractedEntity[]): boolean {
  const hasConcreteFinanceEntity = quoteEntities.some((entity) => isConcreteFinanceEntity(entity))
  const hasSpecificMarketAction = specificMarketActionKeywordPattern.test(quote)
  const hasAssertion = assertionKeywordPattern.test(quote)
  const hasMacroTopic = macroTopicPattern.test(quote)

  if (hardDenyPattern.test(quote)) return false
  if (anecdoteDenyPattern.test(quote)) return false
  if (selfReferentialBanterPattern.test(quote)) return false
  if (hasConcreteFinanceEntity) return hasAssertion && hasSpecificMarketAction
  return hasMacroTopic && hasAssertion && hasSpecificMarketAction
}

function isConcreteFinanceEntity(entity: ExtractedEntity): boolean {
  return Boolean(entity.ticker) || entity.type === 'company' || entity.type === 'currency' || entity.type === 'commodity' || entity.type === 'macro'
}

function classifyClaimType(quote: string, segment: TopicSegment): ClaimType {
  for (const rule of claimTypeRules) {
    if (rule.keywords.some((pattern) => pattern.test(quote))) return rule.type
  }
  if (segment.topics.some((topic) => macroTopicPattern.test(topic))) return 'macro'
  return 'fact'
}

function classifySentiment(quote: string): Sentiment {
  const bullish = bullishPattern.test(quote)
  const bearish = bearishPattern.test(quote)
  if (bullish && bearish) return 'mixed'
  if (bullish) return 'bullish'
  if (bearish) return 'bearish'
  return 'neutral'
}

function scoreConfidence(
  quote: string,
  segment: TopicSegment,
  quoteEntities: ExtractedEntity[],
  segmentEntities: ExtractedEntity[],
): number {
  let score = 0.55
  if (quoteEntities.length > 0) score += 0.15
  else if (segmentEntities.length > 0 && financeMarketKeywordPattern.test(quote)) score += 0.04
  if (segment.mentionedAssets.length > 0) score += 0.05
  if (segment.topics.length > 0) score += 0.05
  if (claimKeywordPatterns.some((pattern) => pattern.test(quote))) score += 0.08
  if (financeMarketKeywordPattern.test(quote)) score += 0.05
  if (quote.length >= 40 && quote.length <= maximumQuoteLength) score += 0.03
  return Math.min(0.9, Math.max(0, Number(score.toFixed(2))))
}

function scoreCandidate(quote: string, quoteEntities: ExtractedEntity[]): number {
  let score = 0
  if (quoteEntities.length > 0) score += 8
  if (quoteEntities.some((entity) => entity.ticker)) score += 4
  if (quoteEntities.some((entity) => entity.type === 'company' || entity.type === 'ticker')) score += 3
  if (financeMarketKeywordPattern.test(quote)) score += 4
  if (macroTopicPattern.test(quote)) score += 2
  if (assertionKeywordPattern.test(quote)) score += 2
  if (quote.length <= maximumQuoteLength) score += 1
  return score
}

function entitiesForQuote(quote: string, entities: ExtractedEntity[]): ExtractedEntity[] {
  return entities.filter((entity) => entityMentionedInQuote(quote, entity))
}

function entityMentionedInQuote(quote: string, entity: ExtractedEntity): boolean {
  const values = [entity.canonicalName, entity.ticker, ...entity.aliases].filter((value): value is string => Boolean(value))
  return values.some((value) => quote.toLocaleLowerCase().includes(value.toLocaleLowerCase()))
}

function isNearDuplicateQuote(quote: string, usedQuotes: Set<string>): boolean {
  return [...usedQuotes].some((usedQuote) => areSimilarQuotes(quote, usedQuote))
}

function areSimilarQuotes(a: string, b: string): boolean {
  const normalizedA = normalizeQuoteForDedup(a)
  const normalizedB = normalizeQuoteForDedup(b)
  if (!normalizedA || !normalizedB) return false
  return normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA) || jaccardSimilarity(normalizedA, normalizedB) >= 0.55
}

function normalizeQuoteForDedup(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s，,、。！？；;：:.!?「」『』()（）]/gu, '')
}

function jaccardSimilarity(a: string, b: string): number {
  const aTokens = new Set(characterShingles(a))
  const bTokens = new Set(characterShingles(b))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length
  const union = new Set([...aTokens, ...bTokens]).size
  return intersection / union
}

function characterShingles(value: string): string[] {
  if (value.length <= 6) return [value]
  const shingles: string[] = []
  for (let index = 0; index <= value.length - 6; index += 1) shingles.push(value.slice(index, index + 6))
  return shingles
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function validateClaims(rawItemId: string, segments: TopicSegment[], claims: ExtractedClaim[]): void {
  const ids = new Set<string>()
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]))

  for (const claim of claims) {
    if (ids.has(claim.id)) throw new Error(`${rawItemId} has duplicate claim id ${claim.id}`)
    ids.add(claim.id)

    const segment = segmentsById.get(claim.segmentId)
    if (!segment) throw new Error(`${rawItemId} claim ${claim.id} references missing segment ${claim.segmentId}`)
    if (!claim.evidence.quote) throw new Error(`${rawItemId} claim ${claim.id} has empty evidence quote`)
    if (!segment.text.includes(claim.evidence.quote)) {
      throw new Error(`${rawItemId} claim ${claim.id} evidence quote is not a substring of segment text`)
    }
    if (claim.confidence < 0 || claim.confidence > 1) {
      throw new Error(`${rawItemId} claim ${claim.id} confidence ${claim.confidence} is outside 0..1`)
    }
  }
}

function resolveRawItemId(segments: TopicSegment[], file: string): string {
  const rawItemIds = uniqueSorted(segments.map((segment) => segment.rawItemId).filter(Boolean))
  if (rawItemIds.length === 1) return rawItemIds[0]
  if (rawItemIds.length > 1) throw new Error(`${file} contains multiple rawItemId values: ${rawItemIds.join(', ')}`)
  return path.basename(file, '.json')
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}
