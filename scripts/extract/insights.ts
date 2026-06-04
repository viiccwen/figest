import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { watchlists, type WatchlistConfig } from '../../src/lib/watchlists'
import type { ExtractedClaim, ExtractedEntity, SummaryItem, WatchlistInsight } from '../../src/lib/types'
import { toZhTw } from '../content-quality'
import { claimDir, ensureDirs, entityDir, insightDir, readJson, summaryDir, writeJson } from '../shared'

type ItemArtifacts = {
  rawItemId: string
  summary?: SummaryItem
  claims: ExtractedClaim[]
  entities: ExtractedEntity[]
}

type MatchContext = {
  watchlist: WatchlistConfig
  matchedTerms: string[]
  matchingClaims: ExtractedClaim[]
  matchingEntities: ExtractedEntity[]
}

const knownTickerTerms = new Set(['0050', '2330', 'AMD', 'ASML', 'BTC', 'NVDA', 'TSM', 'TWD'])

await ensureDirs()

const rawItemIds = await collectRawItemIds()
let itemCount = 0
let insightCount = 0

for (const rawItemId of rawItemIds) {
  const artifacts = await readArtifacts(rawItemId)
  const insights = buildInsights(artifacts)
  validateInsights(rawItemId, insights, artifacts.claims)
  await writeJson(path.join(insightDir, `${rawItemId}.json`), insights)
  itemCount += 1
  insightCount += insights.length
}

console.log(`Generated ${insightCount} watchlist insight(s) for ${itemCount} item(s).`)
await import('../build-digest.ts')

async function collectRawItemIds(): Promise<string[]> {
  const fileSets = await Promise.all([
    jsonBasenames(summaryDir),
    jsonBasenames(claimDir),
    jsonBasenames(entityDir),
  ])
  return uniqueSorted(fileSets.flat())
}

async function jsonBasenames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((file: string) => file.endsWith('.json'))
      .map((file: string) => path.basename(file, '.json'))
  } catch {
    return []
  }
}

async function readArtifacts(rawItemId: string): Promise<ItemArtifacts> {
  const [summary, claims, entities] = await Promise.all([
    readOptionalJson<SummaryItem>(path.join(summaryDir, `${rawItemId}.json`)),
    readOptionalJson<ExtractedClaim[]>(path.join(claimDir, `${rawItemId}.json`)),
    readOptionalJson<ExtractedEntity[]>(path.join(entityDir, `${rawItemId}.json`)),
  ])
  return { rawItemId, summary, claims: claims ?? [], entities: entities ?? [] }
}

async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJson<T>(filePath)
  } catch {
    return undefined
  }
}

function buildInsights(artifacts: ItemArtifacts): WatchlistInsight[] {
  const insights: WatchlistInsight[] = []
  for (const watchlist of watchlists) {
    const context = matchWatchlist(artifacts, watchlist)
    if (!context) continue
    insights.push(buildInsight(artifacts, context))
  }
  return insights.sort((a, b) => a.watchlistKey.localeCompare(b.watchlistKey))
}

function matchWatchlist(artifacts: ItemArtifacts, watchlist: WatchlistConfig): MatchContext | undefined {
  const matchingClaims = artifacts.claims.filter((claim) => matchesAnyTerm(claimText(claim), watchlist.matchTerms))
  const matchingEntities = artifacts.entities.filter((entity) => matchesAnyTerm(entityText(entity), watchlist.matchTerms))
  const summaryMatchedTerms = matchedTerms(summarySignalText(artifacts.summary), watchlist.matchTerms)
  const claimMatchedTerms = matchingClaims.flatMap((claim) => matchedTerms(claimText(claim), watchlist.matchTerms))
  const entityMatchedTerms = matchingEntities.flatMap((entity) => matchedTerms(entityText(entity), watchlist.matchTerms))
  const evidenceMatchedTerms = uniqueSorted([...claimMatchedTerms, ...entityMatchedTerms])
  const allMatchedTerms = uniqueSorted([...summaryMatchedTerms, ...evidenceMatchedTerms])

  if (allMatchedTerms.length === 0 || !passesWatchlistSpecificGuards(watchlist.key, evidenceMatchedTerms, matchingClaims, matchingEntities)) return undefined
  return { watchlist, matchedTerms: allMatchedTerms, matchingClaims, matchingEntities }
}

function passesWatchlistSpecificGuards(watchlistKey: string, terms: string[], matchingClaims: ExtractedClaim[], matchingEntities: ExtractedEntity[]): boolean {
  if (watchlistKey === 'crypto-risk') {
    const normalizedTerms = new Set(terms.map((term) => toZhTw(term).toLowerCase()))
    return matchingClaims.length > 0 && ['bitcoin', 'btc', '比特幣', '資金流出'].some((term) => normalizedTerms.has(term))
  }
  if (matchingClaims.length > 0) return true
  if (watchlistKey === 'semis-ai') {
    return matchingEntities.some((entity) => ['2330', 'TSM', 'NVDA', 'AMD', 'ASML'].includes((entity.ticker ?? '').toUpperCase()) || /台積電|輝達/i.test(entity.canonicalName))
  }
  if (watchlistKey === 'taiwan-market') {
    return matchingEntities.some((entity) => ['0050', '2330', 'TWD', 'TSM'].includes((entity.ticker ?? '').toUpperCase()) || /台股|台積電|台幣|新台幣/i.test(entity.canonicalName))
  }
  return matchingEntities.length > 0
}

function buildInsight(artifacts: ItemArtifacts, context: MatchContext): WatchlistInsight {
  const relatedTickers = relatedTickersFor(context)
  const claimIds = selectClaimIds(context.matchingClaims)
  const titleSubject = titleSubjectFor(artifacts, context, relatedTickers)
  const riskLevel = deriveRiskLevel(artifacts, context)

  return {
    id: `${artifacts.rawItemId}-${context.watchlist.key}`,
    rawItemId: artifacts.rawItemId,
    watchlistKey: context.watchlist.key,
    title: toZhTw(`${context.watchlist.name}觀察：${titleSubject}`).replace(/([^\s])觀察：/u, '$1 觀察：'),
    summary: toZhTw(buildInsightSummary(artifacts, context, relatedTickers, riskLevel)),
    relatedTickers,
    claimIds,
    riskLevel,
  }
}

function buildInsightSummary(
  artifacts: ItemArtifacts,
  context: MatchContext,
  relatedTickers: string[],
  riskLevel: WatchlistInsight['riskLevel'],
): string {
  const keyPoint = bestSummarySentence(artifacts.summary, context.watchlist.matchTerms)
  const claimTheme = bestClaimTheme(context.matchingClaims)
  const entityNames = context.matchingEntities.map((entity) => entity.canonicalName).slice(0, 3)
  const matchedLabel = context.matchedTerms.slice(0, 4).join('、')
  const tickerText = relatedTickers.length ? `相關代號：${relatedTickers.join('、')}。` : ''
  const riskText = riskLevel === 'high' ? '風險訊號偏高，適合列入優先追蹤。' : riskLevel === 'medium' ? '具備後續追蹤價值。' : '目前偏資訊整理，先保留觀察。'

  if (context.watchlist.key === 'crypto-risk' && context.matchingClaims.length) return `主張聚焦比特幣 / ETF 資金流向與風險情緒變化。${tickerText}${riskText}`.trim()
  if (claimTheme) return `${claimTheme} ${tickerText}${riskText}`.trim()
  if (keyPoint) return `${keyPoint} ${tickerText}${riskText}`.trim()
  if (entityNames.length) return `本集提及 ${entityNames.join('、')}，與「${matchedLabel}」觀察清單相關。${tickerText}${riskText}`.trim()
  return `本集摘要與「${matchedLabel}」觀察清單相關。${tickerText}${riskText}`.trim()
}

function bestSummarySentence(summary: SummaryItem | undefined, terms: string[]): string {
  if (!summary) return ''
  const candidates = [...summary.keyPoints, ...summary.risks]
    .map((value) => normalizeSentence(value))
    .filter((value) => value.length >= 12)
  return candidates.find((candidate) => matchesAnyTerm(candidate, terms)) ?? ''
}

function bestClaimTheme(claims: ExtractedClaim[]): string {
  const claim = [...claims].sort(compareClaims)[0]
  if (!claim) return ''
  const prefix = claim.claimType === 'risk' || claim.sentiment === 'bearish'
    ? '主張顯示風險或壓力升高'
    : claim.claimType === 'catalyst' || claim.sentiment === 'bullish'
      ? '主張顯示可能的催化或偏多線索'
      : claim.claimType === 'macro'
        ? '主張聚焦總經變數'
        : '主張提供後續觀察線索'
  const entities = [...claim.entities, ...claim.tickers].slice(0, 3).join('、')
  return entities ? `${prefix}，涉及 ${entities}。` : `${prefix}。`
}

function titleSubjectFor(artifacts: ItemArtifacts, context: MatchContext, relatedTickers: string[]): string {
  if (context.watchlist.key === 'crypto-risk' && context.matchedTerms.some((term) => /bitcoin|btc|比特幣/i.test(term))) return '比特幣'
  if (relatedTickers.length) return relatedTickers.slice(0, 3).join('、')
  const entityName = context.matchingEntities[0]?.canonicalName
  if (entityName) return entityName
  const summaryTopic = artifacts.summary?.topics.find((topic) => matchesAnyTerm(topic, context.watchlist.matchTerms))
  if (summaryTopic) return summaryTopic
  return context.matchedTerms.slice(0, 2).join(' / ')
}

function deriveRiskLevel(artifacts: ItemArtifacts, context: MatchContext): WatchlistInsight['riskLevel'] {
  const claims = context.matchingClaims
  if (claims.some((claim) => claim.claimType === 'risk' || claim.sentiment === 'bearish' || (claim.sentiment === 'mixed' && claim.confidence >= 0.85))) return 'high'
  if (claims.some((claim) => claim.claimType === 'macro' || claim.claimType === 'forecast' || claim.claimType === 'catalyst')) return 'medium'
  if (artifacts.summary?.risks.some((risk) => matchesAnyTerm(risk, context.watchlist.matchTerms))) return 'medium'
  return 'low'
}

function relatedTickersFor(context: MatchContext): string[] {
  const fromClaims = context.matchingClaims.flatMap((claim) => claim.tickers)
  const fromEntities = context.matchingEntities.flatMap((entity) => entity.ticker ? [entity.ticker] : [])
  const fromTerms = context.matchedTerms.filter((term) => knownTickerTerms.has(term.toUpperCase()))
  const tickers = uniqueSorted([...fromClaims, ...fromEntities, ...fromTerms])
  if (context.watchlist.key === 'crypto-risk') return tickers.filter((ticker) => /^(BTC)$/i.test(ticker)).slice(0, 8)
  return tickers.slice(0, 8)
}

function selectClaimIds(claims: ExtractedClaim[]): string[] {
  return [...claims]
    .sort(compareClaims)
    .map((claim) => claim.id)
    .filter(Boolean)
    .slice(0, 5)
}

function compareClaims(a: ExtractedClaim, b: ExtractedClaim): number {
  return riskScore(b) - riskScore(a) || b.confidence - a.confidence || a.id.localeCompare(b.id)
}

function riskScore(claim: ExtractedClaim): number {
  let score = 0
  if (claim.claimType === 'risk') score += 4
  if (claim.claimType === 'catalyst') score += 3
  if (claim.claimType === 'macro') score += 2
  if (claim.sentiment === 'bearish' || claim.sentiment === 'mixed') score += 2
  return score
}

function claimText(claim: ExtractedClaim): string {
  return [claim.claim, claim.claimType, claim.sentiment, ...claim.entities, ...claim.tickers].join(' ')
}

function entityText(entity: ExtractedEntity): string {
  return [entity.canonicalName, entity.ticker, entity.type, ...entity.aliases].filter(Boolean).join(' ')
}

function summarySignalText(summary: SummaryItem | undefined): string {
  if (!summary) return ''
  return [
    summary.title,
    summary.excerpt,
    ...summary.keyPoints,
    ...summary.topics,
    ...summary.mentionedAssets,
    ...summary.risks,
  ].join(' ')
}

function matchedTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => termMatches(text, term))
}

function matchesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => termMatches(text, term))
}

function termMatches(text: string, term: string): boolean {
  const normalizedText = toZhTw(text).toLowerCase()
  const normalizedTerm = toZhTw(term).toLowerCase()
  if (!normalizedText || !normalizedTerm) return false
  if (/^[a-z]+$/iu.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z])${escapeRegExp(normalizedTerm)}([^a-z]|$)`, 'iu').test(normalizedText)
  }
  return normalizedText.includes(normalizedTerm)
}

function normalizeSentence(value: string): string {
  return toZhTw(value)
    .replace(/\s+/g, ' ')
    .replace(/^[-•\s]+/u, '')
    .trim()
    .slice(0, 120)
}

function validateInsights(rawItemId: string, insights: WatchlistInsight[], claims: ExtractedClaim[]): void {
  const ids = new Set<string>()
  const watchlistKeys = new Set<string>()
  const claimIds = new Set(claims.map((claim) => claim.id))
  for (const insight of insights) {
    if (insight.rawItemId !== rawItemId) throw new Error(`${rawItemId} insight has mismatched rawItemId`)
    if (ids.has(insight.id)) throw new Error(`${rawItemId} has duplicate insight id ${insight.id}`)
    if (watchlistKeys.has(insight.watchlistKey)) throw new Error(`${rawItemId} has duplicate watchlist insight ${insight.watchlistKey}`)
    if (!insight.title || !insight.summary) throw new Error(`${rawItemId} ${insight.watchlistKey} has empty title or summary`)
    for (const claimId of insight.claimIds) {
      if (!claimIds.has(claimId)) throw new Error(`${rawItemId} ${insight.watchlistKey} references unknown claim ${claimId}`)
    }
    ids.add(insight.id)
    watchlistKeys.add(insight.watchlistKey)
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
