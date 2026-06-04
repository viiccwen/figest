import { financeGlossary } from './finance-glossary'
import type { ExtractedEntity, TopicSegment } from './types'

type EntityType = ExtractedEntity['type']

type EntityRule = {
  canonicalName: string
  aliases: string[]
  type: EntityType
  ticker?: string
  exchange?: string
}

type EntityDraft = EntityRule & {
  evidenceSegmentIds: Set<string>
  matchedAliases: Set<string>
}

const tickerDenylist = new Set([
  'AI',
  'API',
  'CEO',
  'CHOCO',
  'COVID',
  'CPI',
  'CPU',
  'ETF',
  'FED',
  'FOMC',
  'FREZ',
  'GAO',
  'GDP',
  'GPU',
  'GQ',
  'INF',
  'IPO',
  'MAGA',
  'NBA',
  'NFP',
  'OK',
  'PC',
  'PCE',
  'QA',
  'TESTA',
  'VT',
])

const fallbackTickerAllowlist = new Set([
  'AAPL',
  'AMD',
  'AMZN',
  'ARM',
  'ASML',
  'AVGO',
  'DIA',
  'GLD',
  'GOOG',
  'GOOGL',
  'HYG',
  'IEF',
  'INTC',
  'META',
  'MSFT',
  'MU',
  'NVDA',
  'QQQ',
  'SLV',
  'SPY',
  'TLT',
  'TSLA',
  'TSM',
  'USO',
  'VOO',
])

const manualEntityRules: readonly EntityRule[] = [
  { canonicalName: '川普', aliases: ['Trump', 'Donald Trump', '特朗普'], type: 'person' },
  { canonicalName: '鮑爾', aliases: ['Powell', 'Jerome Powell', '包威爾'], type: 'person' },
  { canonicalName: '葉倫', aliases: ['Yellen', 'Janet Yellen'], type: 'person' },
  { canonicalName: '美元', aliases: ['USD', '美金'], type: 'currency', ticker: 'USD' },
  { canonicalName: '日圓', aliases: ['JPY', '日元'], type: 'currency', ticker: 'JPY' },
  { canonicalName: '歐元', aliases: ['EUR'], type: 'currency', ticker: 'EUR' },
  { canonicalName: '新台幣', aliases: ['台幣', 'TWD', 'NTD'], type: 'currency', ticker: 'TWD' },
  { canonicalName: '黃金', aliases: ['Gold', 'XAU'], type: 'commodity' },
  { canonicalName: '原油', aliases: ['Crude Oil', '西德州原油', 'WTI', '布蘭特原油', 'Brent'], type: 'commodity' },
  { canonicalName: '半導體', aliases: ['晶片', '晶圓', '晶圓代工'], type: 'topic' },
  { canonicalName: 'AI', aliases: ['人工智慧', '人工智能'], type: 'topic' },
  { canonicalName: 'ETF', aliases: ['指數股票型基金'], type: 'topic' },
]

export const entityRules: readonly EntityRule[] = [
  ...financeGlossary.map((entry) => ({
    canonicalName: entry.canonical,
    aliases: uniqueSorted([
      ...entry.aliases,
      ...(entry.ticker ? [entry.ticker] : []),
      // Keep ADR ticker matching deterministic while preserving the TWSE ticker in the existing glossary.
      ...(entry.canonical === '台積電' ? ['TSM'] : []),
      ...(entry.canonical === '輝達' ? ['NVDA'] : []),
    ].filter((alias) => alias !== entry.canonical)),
    type: glossaryTypeToEntityType(entry.type),
    ticker: entry.ticker,
    exchange: entry.exchange,
  })),
  ...manualEntityRules,
].sort((a, b) => b.canonicalName.length - a.canonicalName.length || a.canonicalName.localeCompare(b.canonicalName))

export function extractEntitiesFromSegments(segments: TopicSegment[]): ExtractedEntity[] {
  const drafts = new Map<string, EntityDraft>()

  for (const segment of segments) {
    const searchableText = [segment.title, segment.text, ...segment.topics, ...segment.mentionedAssets].join(' ')

    for (const rule of entityRules) {
      const matchedAliases = matchedRuleAliases(searchableText, rule)
      if (matchedAliases.length === 0) continue

      const draft = getOrCreateDraft(drafts, rule)
      draft.evidenceSegmentIds.add(segment.id)
      for (const alias of matchedAliases) draft.matchedAliases.add(alias)
    }

    for (const ticker of findFallbackTickerTokens(searchableText)) {
      if (hasGlossaryTickerCanonicalization(searchableText, ticker)) continue

      const rule: EntityRule = { canonicalName: ticker, aliases: [], type: 'ticker', ticker }
      const draft = getOrCreateDraft(drafts, rule)
      draft.evidenceSegmentIds.add(segment.id)
      draft.matchedAliases.add(ticker)
    }
  }

  return [...drafts.values()]
    .map((draft) => ({
      id: buildEntityId(draft),
      canonicalName: draft.canonicalName,
      aliases: uniqueSorted([...draft.matchedAliases].filter((alias) => alias !== draft.canonicalName)),
      type: draft.type,
      ticker: draft.ticker,
      exchange: draft.exchange,
      evidenceSegmentIds: uniqueSorted([...draft.evidenceSegmentIds]),
    }))
    .sort(compareEntities)
}

function matchedRuleAliases(text: string, rule: EntityRule): string[] {
  return [rule.canonicalName, ...rule.aliases].filter((alias) => alias && buildAliasPattern(alias).test(text))
}

function findFallbackTickerTokens(text: string): string[] {
  const tickers = new Set<string>()
  for (const match of text.matchAll(/(?<![A-Za-z0-9])([A-Z]{2,5})(?![A-Za-z0-9])/g)) {
    const ticker = match[1]
    if (tickerDenylist.has(ticker)) continue
    if (!fallbackTickerAllowlist.has(ticker)) continue

    tickers.add(ticker)
  }
  return [...tickers].sort((a, b) => a.localeCompare(b))
}

function hasGlossaryTickerCanonicalization(text: string, ticker: string): boolean {
  return entityRules.some((rule) => rule.type !== 'ticker' && [rule.canonicalName, ...rule.aliases, rule.ticker].filter(Boolean).includes(ticker) && matchedRuleAliases(text, rule).length > 0)
}

function getOrCreateDraft(drafts: Map<string, EntityDraft>, rule: EntityRule): EntityDraft {
  const key = `${rule.canonicalName}\u0000${rule.ticker ?? ''}\u0000${rule.type}`
  const existing = drafts.get(key)
  if (existing) return existing

  const draft = {
    ...rule,
    aliases: uniqueSorted(rule.aliases),
    evidenceSegmentIds: new Set<string>(),
    matchedAliases: new Set<string>(),
  }
  drafts.set(key, draft)
  return draft
}

function buildEntityId(entity: EntityRule): string {
  return `entity-${entity.type}-${slugPart(entity.canonicalName)}${entity.ticker ? `-${slugPart(entity.ticker)}` : ''}`
}

function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-|-$/g, '')
}

function glossaryTypeToEntityType(type: 'asset' | 'macro' | 'topic'): EntityType {
  if (type === 'asset') return 'company'
  return type
}

function buildAliasPattern(alias: string): RegExp {
  const escaped = escapeRegExp(alias)
  if (/^[A-Za-z0-9.]+$/.test(alias)) return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'g')
  return new RegExp(escaped, 'g')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function compareEntities(a: ExtractedEntity, b: ExtractedEntity): number {
  return a.type.localeCompare(b.type)
    || a.canonicalName.localeCompare(b.canonicalName)
    || (a.ticker ?? '').localeCompare(b.ticker ?? '')
}
