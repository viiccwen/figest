export type FinanceGlossaryEntry = {
  canonical: string
  aliases: string[]
  type: 'asset' | 'macro' | 'topic'
  ticker?: string
  exchange?: 'TWSE' | 'NASDAQ' | string
}

export type FinanceCorrectionReason = 'finance-glossary' | 'ticker-alias' | 'manual-rule'

export type FinanceCorrection = {
  from: string
  to: string
  reason: FinanceCorrectionReason
  count: number
}

export const financeGlossary: readonly FinanceGlossaryEntry[] = [
  {
    canonical: '台積電',
    aliases: ['台積', 'TSMC', 'tsmc'],
    type: 'asset',
    ticker: '2330',
    exchange: 'TWSE',
  },
  {
    canonical: '輝達',
    aliases: ['Nvidia', 'nvidia', '英偉達'],
    type: 'asset',
    ticker: 'NVDA',
    exchange: 'NASDAQ',
  },
  {
    canonical: '聯準會',
    aliases: ['Fed', 'FED', '美國央行'],
    type: 'macro',
  },
  {
    canonical: '非農就業',
    aliases: ['NFP', '非農'],
    type: 'macro',
  },
  {
    canonical: 'CPI',
    aliases: ['消費者物價指數', '通膨指數'],
    type: 'macro',
  },
  {
    canonical: 'PCE',
    aliases: ['個人消費支出', '個人消費支出物價指數'],
    type: 'macro',
  },
  {
    canonical: 'FOMC',
    aliases: ['聯邦公開市場委員會'],
    type: 'macro',
  },
  {
    canonical: '美債殖利率',
    aliases: ['美債收益率', '美國公債殖利率', '美國十年期公債殖利率', '10年期美債殖利率'],
    type: 'macro',
  },
  {
    canonical: '降息',
    aliases: ['降利率', '調降利率'],
    type: 'macro',
  },
  {
    canonical: '升息',
    aliases: ['升利率', '加息', '調升利率'],
    type: 'macro',
  },
]

type ReplacementRule = {
  from: string
  to: string
  reason: FinanceCorrectionReason
}

type ScanResult = {
  normalized: string
  corrections: Map<string, FinanceCorrection>
}

const replacementRules: ReplacementRule[] = financeGlossary
  .flatMap((entry) => {
    const aliases = [...entry.aliases]
    if (entry.ticker && !/^\d+$/.test(entry.ticker)) aliases.push(entry.ticker)

    return aliases
      .filter((alias) => alias !== entry.canonical)
      .map((alias) => ({
        from: alias,
        to: entry.canonical,
        reason: alias === entry.ticker ? 'ticker-alias' as const : 'finance-glossary' as const,
      }))
  })
  .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from))

const canonicalTerms = [...new Set(financeGlossary.map((entry) => entry.canonical))]
  .sort((a, b) => b.length - a.length || a.localeCompare(b))

export function normalizeFinanceTerms(text: string): string {
  return scanFinanceTermReplacements(text).normalized
}

export function collectCorrections(text: string): FinanceCorrection[] {
  const { corrections } = scanFinanceTermReplacements(text)
  return [...corrections.values()].sort((a, b) => a.to.localeCompare(b.to) || a.from.localeCompare(b.from))
}

export function findMentionedAssets(text: string): string[] {
  const mentioned = new Set<string>()

  for (const entry of financeGlossary) {
    const values = [entry.canonical, ...entry.aliases, entry.ticker].filter((value): value is string => Boolean(value))
    if (values.some((value) => buildAliasPattern(value).test(text))) mentioned.add(entry.canonical)
  }

  return [...mentioned].sort((a, b) => a.localeCompare(b))
}

function scanFinanceTermReplacements(text: string): ScanResult {
  let normalized = ''
  const corrections = new Map<string, FinanceCorrection>()

  for (let index = 0; index < text.length;) {
    const canonical = canonicalTerms.find((term) => text.startsWith(term, index))
    if (canonical) {
      normalized += canonical
      index += canonical.length
      continue
    }

    const rule = replacementRules.find((candidate) => isAliasMatchAt(text, index, candidate.from))
    if (rule) {
      normalized += rule.to
      recordCorrection(corrections, rule)
      index += rule.from.length
      continue
    }

    normalized += text[index]
    index += 1
  }

  return { normalized, corrections }
}

function recordCorrection(corrections: Map<string, FinanceCorrection>, rule: ReplacementRule): void {
  if (rule.from === rule.to) return

  const key = `${rule.from}\u0000${rule.to}\u0000${rule.reason}`
  const existing = corrections.get(key)
  if (existing) {
    existing.count += 1
    return
  }

  corrections.set(key, { from: rule.from, to: rule.to, reason: rule.reason, count: 1 })
}

function isAliasMatchAt(text: string, index: number, alias: string): boolean {
  if (!text.startsWith(alias, index)) return false
  if (!/^[A-Za-z0-9.]+$/.test(alias)) return true

  const before = index === 0 ? '' : text[index - 1]
  const after = index + alias.length >= text.length ? '' : text[index + alias.length]
  return !isAsciiLetterOrDigit(before) && !isAsciiLetterOrDigit(after)
}

function isAsciiLetterOrDigit(value: string): boolean {
  return /^[A-Za-z0-9]$/.test(value)
}

function buildAliasPattern(alias: string): RegExp {
  const escaped = escapeRegExp(alias)
  if (/^[A-Za-z0-9.]+$/.test(alias)) return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'g')

  return new RegExp(escaped, 'g')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
