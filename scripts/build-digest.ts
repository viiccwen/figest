import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { DigestEntityChip, EvidenceClaim, ExtractedClaim, ExtractedEntity, SummaryItem, WatchlistInsight } from '../src/lib/types'
import { buildIndex, claimDir, ensureDirs, entityDir, generatedDir, insightDir, publicDataDir, readJson, summaryDir, writeJson } from './shared'
import { toZhTw } from './content-quality'

const maxClaimsPerSummary = 4
const maxInsightsPerSummary = 3
const maxEntityChipsPerSummary = 8

await ensureDirs()
const files = (await readdir(summaryDir)).filter((file) => file.endsWith('.json'))
const summaries = await Promise.all(files.map((file) => readEnrichedSummary(file)))
const index = buildIndex(summaries)
await writeJson(path.join(generatedDir, 'index.json'), index)
await writeJson(path.join(publicDataDir, 'index.json'), index)
console.log(`Built digest index with ${index.summaries.length} summary item(s).`)

async function readEnrichedSummary(file: string): Promise<SummaryItem> {
  const summary = await readJson<SummaryItem>(path.join(summaryDir, file))
  const rawItemId = path.basename(file, '.json')
  const [claims, insights, entities] = await Promise.all([
    readOptionalJson<ExtractedClaim[]>(path.join(claimDir, `${rawItemId}.json`)),
    readOptionalJson<WatchlistInsight[]>(path.join(insightDir, `${rawItemId}.json`)),
    readOptionalJson<ExtractedEntity[]>(path.join(entityDir, `${rawItemId}.json`)),
  ])

  return pruneEmpty({
    ...summary,
    evidenceClaims: selectEvidenceClaims(claims ?? []),
    watchlistInsights: selectWatchlistInsights(insights ?? []),
    entityChips: selectEntityChips(summary, claims ?? [], entities ?? []),
  })
}

async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJson<T>(filePath)
  } catch {
    return undefined
  }
}

function selectEvidenceClaims(claims: ExtractedClaim[]): EvidenceClaim[] {
  return [...claims]
    .filter((claim) => (claim.confidence ?? 0) >= 0.72 && (claim.claim || claim.evidence?.quote))
    .sort(compareClaims)
    .slice(0, maxClaimsPerSummary)
    .map((claim) => ({
      id: claim.id,
      claim: conciseClaimText(claim),
      claimType: claim.claimType,
      sentiment: claim.sentiment,
      confidence: Number(claim.confidence.toFixed(2)),
      entities: normalizedUnique(claim.entities).slice(0, 4),
      tickers: normalizedUnique(claim.tickers).slice(0, 4),
      evidence: claim.evidence
        ? {
            start: claim.evidence.start,
            end: claim.evidence.end,
            quote: compactText(claim.evidence.quote, 88),
          }
        : undefined,
    }))
}

function selectWatchlistInsights(insights: WatchlistInsight[]): WatchlistInsight[] {
  return [...insights]
    .sort(compareInsights)
    .slice(0, maxInsightsPerSummary)
    .map((insight) => ({
      ...insight,
      title: compactText(insight.title, 56),
      summary: compactText(insight.summary, 128),
      relatedTickers: normalizedUnique(insight.relatedTickers).slice(0, 6),
      claimIds: insight.claimIds.slice(0, 5),
    }))
}

function selectEntityChips(summary: SummaryItem, claims: ExtractedClaim[], entities: ExtractedEntity[]): DigestEntityChip[] {
  const chips: DigestEntityChip[] = []
  for (const asset of summary.mentionedAssets) addChip(chips, { label: asset, type: inferChipType(asset, entities), ticker: tickerFor(asset, entities) })
  for (const ticker of claims.flatMap((claim) => claim.tickers)) addChip(chips, { label: ticker, type: inferChipType(ticker, entities), ticker })
  for (const entity of entities) {
    if (['company', 'ticker', 'currency', 'commodity', 'macro'].includes(entity.type)) {
      addChip(chips, { label: entity.ticker ?? entity.canonicalName, type: entity.type, ticker: entity.ticker })
    }
  }
  return chips.slice(0, maxEntityChipsPerSummary)
}

function addChip(chips: DigestEntityChip[], chip: DigestEntityChip) {
  const label = toZhTw(chip.label).trim()
  if (!label) return
  const key = `${label.toLowerCase()}\u0000${chip.ticker?.toLowerCase() ?? ''}`
  if (chips.some((item) => `${item.label.toLowerCase()}\u0000${item.ticker?.toLowerCase() ?? ''}` === key)) return
  chips.push({ ...chip, label })
}

function inferChipType(label: string, entities: ExtractedEntity[]): DigestEntityChip['type'] {
  const normalizedLabel = label.toLowerCase()
  return entities.find((entity) => [entity.canonicalName, entity.ticker, ...entity.aliases].filter(Boolean).some((value) => value.toLowerCase() === normalizedLabel))?.type ?? 'ticker'
}

function tickerFor(label: string, entities: ExtractedEntity[]): string | undefined {
  const normalizedLabel = label.toLowerCase()
  return entities.find((entity) => [entity.canonicalName, entity.ticker, ...entity.aliases].filter(Boolean).some((value) => value.toLowerCase() === normalizedLabel))?.ticker
}

function compareClaims(a: ExtractedClaim, b: ExtractedClaim) {
  return scoreClaim(b) - scoreClaim(a) || b.confidence - a.confidence || a.id.localeCompare(b.id)
}

function scoreClaim(claim: ExtractedClaim) {
  const typeScore: Record<ExtractedClaim['claimType'], number> = { risk: 8, catalyst: 7, macro: 6, valuation: 5, forecast: 4, fact: 3, opinion: 2 }
  const sentimentScore = claim.sentiment === 'bearish' || claim.sentiment === 'mixed' ? 2 : claim.sentiment === 'bullish' ? 1 : 0
  return (typeScore[claim.claimType] ?? 0) + sentimentScore + claim.confidence * 10
}

function compareInsights(a: WatchlistInsight, b: WatchlistInsight) {
  return riskLevelScore(b.riskLevel) - riskLevelScore(a.riskLevel) || b.claimIds.length - a.claimIds.length || a.title.localeCompare(b.title)
}

function riskLevelScore(value: WatchlistInsight['riskLevel']) {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1
}

function normalizedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => toZhTw(value).trim()).filter(Boolean))]
}

function conciseClaimText(claim: ExtractedClaim): string {
  const text = claim.claim || claim.evidence.quote
  if (/荷姆[斯茲]海[峡峽]|布[蘭兰]特原油|原油[價价]格|控制[權权]/.test(text)) return '荷姆茲海峽等地緣議題仍難快速談攏，原油價格反應顯示市場仍在評估能源供給風險。'
  if (/台[韓韩]|南[韓韩]股市|美元[計计][價价]|標普|标普|美股/.test(text)) return '資金表現集中在台韓市場；以美元計價，台韓股市漲幅明顯領先標普等美股大盤。'
  if (/USTR|關稅|关税|保[護护]主[義义]|[貿贸]易代表署/.test(text)) return '美國貿易代表署關稅提案重啟政策不確定性，台灣、歐盟等多個經濟體被納入觀察。'
  if (/物[價价]|通膨|補貼|补贴|財政|财政/.test(text) && /2022|體感|体感|政府/.test(text)) return '政府以補貼抑制物價體感，反映通膨壓力與財政空間仍是後續觀察重點。'
  if (/比特[幣币]|Bitcoin|BTC|ETF|現貨|现货|資金.*流出|资金.*流出/.test(text)) return '比特幣現貨 ETF 資金流向與前波低點，是觀察風險情緒的關鍵線索。'
  if (/Meta|Google|CSP|現金流|现金流|發債|发债|資本支出|资本支出/.test(text)) return '大型雲端與 AI 資本支出推高資金需求，相關現金流與發債壓力值得追蹤。'
  if (/手機|手机|PC|記憶體|记忆体|小米|榮耀|荣耀|低階/.test(text)) return '記憶體成本上升壓縮低階手機市場，手機銷售展望下修可能影響出貨動能。'
  return compactText(text, 112)
}

function compactText(value: string, max: number): string {
  const clean = toZhTw(value).replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).replace(/[，,。；;：:\s]+$/u, '')}…`
}

function pruneEmpty(summary: SummaryItem): SummaryItem {
  if (!summary.evidenceClaims?.length) delete summary.evidenceClaims
  if (!summary.watchlistInsights?.length) delete summary.watchlistInsights
  if (!summary.entityChips?.length) delete summary.entityChips
  return summary
}
