import { AlertTriangle, ArrowLeft, Bot, CalendarDays, ExternalLink, Newspaper, Quote, Radio, Search, ShieldCheck, Sparkles, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { Badge, ButtonLink, Card } from './components/ui'
import { sources } from './lib/sources'
import type { DigestIndex, SummaryItem } from './lib/types'
import { formatDate, formatDateTime } from './lib/utils'
import digest from './data/generated/index.json'

const digestIndex = digest as DigestIndex

function Shell() {
  return (
    <div className="bg-grid min-h-svh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.18),transparent_50%),radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.16),transparent_30%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.24),transparent_50%),radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.18),transparent_30%)]" />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="flex items-center gap-3 font-semibold tracking-tight" to="/">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-lg shadow-zinc-300 dark:bg-white dark:text-zinc-950 dark:shadow-black"><Newspaper className="size-4" /></span>
          <span>財經節目 Digest</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300">
          <NavLink className={({ isActive }) => `rounded-full px-3 py-2 transition hover:text-zinc-950 dark:hover:text-white ${isActive ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : ''}`} to="/">最新</NavLink>
          <NavLink className={({ isActive }) => `rounded-full px-3 py-2 transition hover:text-zinc-950 dark:hover:text-white ${isActive ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : ''}`} to="/about">關於</NavLink>
          <NavLink className={({ isActive }) => `rounded-full px-3 py-2 transition hover:text-zinc-950 dark:hover:text-white ${isActive ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : ''}`} to="/disclaimer">聲明</NavLink>
        </nav>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <Routes>
          <Route element={<HomePage />} path="/" />
          <Route element={<ShowPage />} path="/shows/:showSlug" />
          <Route element={<SummaryDetailPage />} path="/summaries/:summaryId" />
          <Route element={<AboutPage />} path="/about" />
          <Route element={<DisclaimerPage />} path="/disclaimer" />
        </Routes>
      </main>
      <footer className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-8 text-xs leading-6 text-zinc-600 dark:text-zinc-400 sm:px-8">
        <div className="rounded-3xl border border-zinc-200 bg-white/60 p-5 dark:border-zinc-800 dark:bg-zinc-950/70">
          {digestIndex.disclaimer} 本站僅連結公開來源，不重刊完整逐字稿。
        </div>
      </footer>
    </div>
  )
}

function HomePage() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const selected = params.get('show') ?? 'all'
  const summaries = useMemo(() => filterSummaries(digestIndex.summaries, selected, query), [selected, query])
  const claimCount = useMemo(() => digestIndex.summaries.reduce((total, summary) => total + (summary.evidenceClaims?.length ?? 0), 0), [])
  const insightCount = useMemo(() => digestIndex.summaries.reduce((total, summary) => total + (summary.watchlistInsights?.length ?? 0), 0), [])

  return (
    <div className="space-y-8">
      <section className="grid gap-8 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="animate-fade-up space-y-6">
          <Badge tone="violet"><Sparkles className="mr-1.5 size-3" /> 每日自動摘要</Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white sm:text-7xl">每日財經節目摘要，自動生成。</h1>
            <p className="max-w-2xl text-base leading-8 text-zinc-600 dark:text-zinc-300 sm:text-lg">追蹤股癌與財經皓角公開 podcast 內容，整理 TL;DR、重點、風險提醒，並標出可回溯證據的主張、觀察清單與相關標的。</p>
          </div>
        </div>
        <Card className="animate-fade-up p-5 [animation-delay:120ms]">
          <div className="flex items-center gap-3 text-sm font-medium text-zinc-600 dark:text-zinc-300"><Bot className="size-4" /> Pipeline 狀態</div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Stat label="來源" value={sources.length.toString()} />
            <Stat label="摘要" value={digestIndex.summaries.length.toString()} />
            <Stat label="主張" value={claimCount.toString()} />
            <Stat label="洞察" value={insightCount.toString()} />
            <Stat label="更新時間" value={formatDateTime(digestIndex.generatedAt)} wide />
          </dl>
        </Card>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white/75 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/75 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button className={tabClass(selected === 'all')} onClick={() => setParams({})} type="button">全部</button>
          {sources.map((source) => <button className={tabClass(selected === source.slug)} key={source.id} onClick={() => setParams({ show: source.slug })} type="button">{source.name}</button>)}
        </div>
        <label className="flex min-w-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 sm:w-72">
          <Search className="size-4" />
          <input className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋主題、個股、標題" value={query} />
        </label>
      </section>

      <SummaryList summaries={summaries} />
    </div>
  )
}

function ShowPage() {
  const { showSlug } = useParams()
  const source = sources.find((item) => item.slug === showSlug)
  if (!source) return <NotFound />
  const summaries = digestIndex.summaries.filter((item) => item.sourceSlug === source.slug)
  return (
    <div className="space-y-8 py-10">
      <Link className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-violet-700 dark:text-zinc-400 dark:hover:text-violet-200" to="/"><ArrowLeft className="size-4" /> 返回首頁</Link>
      <section className="space-y-4">
        <Badge tone={source.accent}>{source.kind}</Badge>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{source.name}</h1>
        <p className="max-w-2xl leading-8 text-zinc-600 dark:text-zinc-300">{source.description}</p>
        <ButtonLink href={source.homepage} rel="noreferrer" target="_blank">原始來源 <ExternalLink className="ml-2 size-4" /></ButtonLink>
      </section>
      <SummaryList summaries={summaries} />
    </div>
  )
}

function SummaryDetailPage() {
  const { summaryId } = useParams()
  const summary = digestIndex.summaries.find((item) => item.id === summaryId)
  if (!summary) return <NotFound />

  return (
    <article className="mx-auto max-w-3xl space-y-7 py-10">
      <Link className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-violet-700 dark:text-zinc-400 dark:hover:text-violet-200" to="/"><ArrowLeft className="size-4" /> 返回摘要列表</Link>
      <header className="space-y-5">
        <Badge tone={summary.sourceSlug === 'gooaye' ? 'violet' : 'blue'}>{summary.sourceName}</Badge>
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl">{summary.title}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" /> {formatDate(summary.publishedAt)}</span>
          <span>生成：{formatDateTime(summary.summarizedAt)}</span>
          <span>資料品質：{sourceQualityLabel(summary.sourceTextQuality)}</span>
        </div>
      </header>
      <Notice />
      <Card className="p-6">
        <h2 className="text-lg font-bold">TL;DR</h2>
        <p className="mt-3 leading-8 text-zinc-700 dark:text-zinc-300">{summary.excerpt}</p>
      </Card>
      <section className="grid gap-5 sm:grid-cols-2">
        <Card className="p-6"><h2 className="font-bold">重點</h2><ul className="mt-4 space-y-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">{summary.keyPoints.map((point) => <li key={point}>• {point}</li>)}</ul></Card>
        <Card className="p-6"><h2 className="font-bold">風險 / 限制</h2><ul className="mt-4 space-y-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">{summary.risks.map((risk) => <li key={risk}>• {risk}</li>)}</ul></Card>
      </section>
      <EvidenceClaims claims={summary.evidenceClaims ?? []} />
      <WatchlistInsights insights={summary.watchlistInsights ?? []} />
      <EntityChips summary={summary} />
      <Card className="p-6">
        <h2 className="font-bold">摘要本文</h2>
        <div className="digest-prose mt-4 dark:text-zinc-300">{summary.body.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </Card>
      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">{summary.topics.map((topic) => <Badge key={topic}>{topic}</Badge>)}{summary.mentionedAssets.map((asset) => <Badge key={asset} tone="amber">{asset}</Badge>)}</div>
        <ButtonLink href={summary.url} rel="noreferrer" target="_blank">打開原始內容 <ExternalLink className="ml-2 size-4" /></ButtonLink>
      </section>
    </article>
  )
}

function EvidenceClaims({ claims }: { claims: NonNullable<SummaryItem['evidenceClaims']> }) {
  if (!claims.length) return null
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-6 py-4 dark:border-zinc-800">
        <h2 className="inline-flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-emerald-600" /> 證據主張</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">前 {claims.length} 則</span>
      </div>
      <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {claims.map((claim) => (
          <article className="space-y-3 p-6" key={claim.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{claimTypeLabel(claim.claimType)}</Badge>
              <Badge tone={sentimentTone(claim.sentiment)}>{sentimentLabel(claim.sentiment)}</Badge>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">信心 {Math.round(claim.confidence * 100)}%</span>
              {claim.evidence?.start != null ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatTimestamp(claim.evidence.start)}</span> : null}
            </div>
            <p className="text-sm leading-7 text-zinc-800 dark:text-zinc-200">{claim.claim}</p>
            {claim.evidence?.quote ? <blockquote className="flex gap-2 rounded-2xl bg-zinc-50 p-3 text-xs leading-6 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"><Quote className="mt-1 size-3 shrink-0" /> {displayZhTw(claim.evidence.quote)}</blockquote> : null}
            {[...claim.tickers, ...claim.entities].length ? <div className="flex flex-wrap gap-2">{[...claim.tickers, ...claim.entities].slice(0, 6).map((label) => <Badge key={label} tone="amber">{label}</Badge>)}</div> : null}
          </article>
        ))}
      </div>
    </Card>
  )
}

function WatchlistInsights({ insights }: { insights: NonNullable<SummaryItem['watchlistInsights']> }) {
  if (!insights.length) return null
  return (
    <section className="space-y-3">
      <h2 className="inline-flex items-center gap-2 px-1 font-bold"><Sparkles className="size-4 text-violet-600" /> 觀察清單洞察</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {insights.map((insight) => (
          <Card className="p-5" key={insight.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={riskTone(insight.riskLevel)}>風險 {riskLevelLabel(insight.riskLevel)}</Badge>
              {insight.claimIds.length ? <span className="text-xs text-zinc-500 dark:text-zinc-400">連結 {insight.claimIds.length} 則主張</span> : null}
            </div>
            <h3 className="mt-3 font-bold text-zinc-950 dark:text-white">{insight.title}</h3>
            <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">{insight.summary}</p>
            {insight.relatedTickers.length ? <div className="mt-4 flex flex-wrap gap-2">{insight.relatedTickers.map((ticker) => <Badge key={ticker} tone="amber">{ticker}</Badge>)}</div> : null}
          </Card>
        ))}
      </div>
    </section>
  )
}

function EntityChips({ summary }: { summary: SummaryItem }) {
  const chips = summary.entityChips?.length ? summary.entityChips.map((chip) => chip.label) : summary.mentionedAssets
  if (!chips.length) return null
  return (
    <Card className="p-5">
      <h2 className="inline-flex items-center gap-2 font-bold"><Tags className="size-4 text-amber-600" /> 標的 / 實體索引</h2>
      <div className="mt-4 flex flex-wrap gap-2">{chips.map((label) => <Badge key={label} tone="amber">{label}</Badge>)}</div>
    </Card>
  )
}

function AboutPage() {
  return <InfoPage title="關於" body={[ '這是一個自動化財經內容 digest MVP：排程抓取 podcast RSS，正規化成 raw content，再生成結構化摘要 JSON，最後由 Vite 靜態網站呈現。', '目前摘要會優先使用逐字稿、證據主張與觀察清單 artifact；不足時才退回 metadata / show notes 的保守摘要。', '設計原則是 attribution first：每篇都連回原始內容，摘要只做學習與資訊整理，不取代原節目。' ]} />
}

function DisclaimerPage() {
  return <InfoPage title="聲明" body={[ digestIndex.disclaimer, 'AI 摘要可能包含錯誤、遺漏或時間延遲。任何個股、ETF、產業或總經資訊都應回到原始節目與正式資料來源查證。', '本站不提供投資顧問、投資建議或買賣訊號，也不保證內容完整性與即時性。' ]} />
}

function InfoPage({ title, body }: { title: string; body: string[] }) {
  return <section className="mx-auto max-w-3xl space-y-6 py-12"><h1 className="text-5xl font-black tracking-tight">{title}</h1><Card className="space-y-5 p-7 text-base leading-8 text-zinc-700 dark:text-zinc-300">{body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</Card></section>
}

function SummaryList({ summaries }: { summaries: SummaryItem[] }) {
  if (summaries.length === 0) return <Card className="p-10 text-center text-zinc-500 dark:text-zinc-400">目前沒有符合條件的摘要。</Card>
  return <section className="grid gap-4">{summaries.map((summary, index) => <SummaryCard index={index} key={summary.id} summary={summary} />)}</section>
}

function SummaryCard({ summary, index }: { summary: SummaryItem; index: number }) {
  return (
    <Card className="group animate-fade-up p-5 transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-100/70 dark:hover:border-violet-400/50 dark:hover:shadow-violet-950/30" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <Link className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center" to={`/summaries/${summary.id}`}>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={summary.sourceSlug === 'gooaye' ? 'violet' : 'blue'}>{summary.sourceName}</Badge><span className="text-xs text-zinc-600 dark:text-zinc-400">{formatDate(summary.publishedAt)}</span><span className="text-xs text-zinc-500 dark:text-zinc-400">{sourceQualityLabel(summary.sourceTextQuality)}</span></div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-950 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-200">{summary.title}</h2>
          <p className="leading-7 text-zinc-600 dark:text-zinc-300">{compact(summary.excerpt, 180)}</p>
          <div className="flex flex-wrap gap-2">
            {summary.topics.slice(0, 4).map((topic) => <Badge key={topic}>{topic}</Badge>)}
            {(summary.entityChips ?? summary.mentionedAssets.map((asset) => ({ label: asset }))).slice(0, 4).map((chip) => <Badge key={chip.label} tone="amber">{chip.label}</Badge>)}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {(summary.evidenceClaims?.length ?? 0) > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800"><ShieldCheck className="size-3" /> {summary.evidenceClaims?.length} 則證據主張</span> : null}
            {(summary.watchlistInsights?.length ?? 0) > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200"><Sparkles className="size-3" /> {summary.watchlistInsights?.length} 個觀察</span> : null}
          </div>
        </div>
        <span className="inline-flex items-center text-sm font-medium text-violet-700 dark:text-violet-200">閱讀摘要 <ExternalLink className="ml-2 size-4" /></span>
      </Link>
    </Card>
  )
}

function Notice() {
  return <div className="flex gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> 本摘要由 AI 自動生成，可能包含錯誤或遺漏。請以原始節目內容為準，且不構成任何投資建議。</div>
}

function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900 ${wide ? 'col-span-2' : ''}`}><dt className="text-zinc-500 dark:text-zinc-400">{label}</dt><dd className="mt-1 font-semibold text-zinc-950 dark:text-white">{value}</dd></div>
}

function NotFound() {
  return <section className="py-20 text-center"><Radio className="mx-auto mb-4 size-8 text-zinc-400" /><h1 className="text-3xl font-bold">找不到內容</h1><Link className="mt-5 inline-flex text-violet-700 dark:text-violet-200" to="/">回首頁</Link></section>
}

function filterSummaries(summaries: SummaryItem[], selected: string, query: string) {
  const keyword = query.trim().toLowerCase()
  return summaries.filter((summary) => {
    const showMatch = selected === 'all' || summary.sourceSlug === selected
    const queryMatch = !keyword || [
      summary.title,
      summary.excerpt,
      ...summary.topics,
      ...summary.mentionedAssets,
      ...(summary.entityChips?.map((chip) => chip.label) ?? []),
      ...(summary.evidenceClaims?.flatMap((claim) => [claim.claim, ...claim.entities, ...claim.tickers]) ?? []),
      ...(summary.watchlistInsights?.flatMap((insight) => [insight.title, insight.summary, ...insight.relatedTickers]) ?? []),
    ].join(' ').toLowerCase().includes(keyword)
    return showMatch && queryMatch
  })
}

function compact(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max).trim()}…` : value
}

function displayZhTw(value: string) {
  return value
    .replaceAll('谈拢', '談攏')
    .replaceAll('谈', '談')
    .replaceAll('海峡', '海峽')
    .replaceAll('涨', '漲')
    .replaceAll('涨幅', '漲幅')
    .replaceAll('几乎', '幾乎')
    .replaceAll('计價', '計價')
    .replaceAll('计价', '計價')
    .replaceAll('台币', '台幣')
    .replaceAll('强度', '強度')
    .replaceAll('美元计', '美元計')
    .replaceAll('实际', '實際')
    .replaceAll('利润', '利潤')
    .replaceAll('补贴', '補貼')
    .replaceAll('风险', '風險')
    .replaceAll('市场', '市場')
}

function sourceQualityLabel(value: SummaryItem['sourceTextQuality']) {
  if (value === 'transcript') return 'Whisper 逐字稿'
  if (value === 'show-notes') return 'Show notes 摘要'
  return 'Metadata 摘要'
}

function tabClass(active: boolean) {
  return `rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'bg-zinc-950 text-white shadow-lg shadow-zinc-300 dark:bg-white dark:text-zinc-950 dark:shadow-black' : 'bg-white text-zinc-600 hover:text-violet-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-violet-200'}`
}

function claimTypeLabel(value: NonNullable<SummaryItem['evidenceClaims']>[number]['claimType']) {
  const labels = { fact: '事實', forecast: '預測', opinion: '觀點', risk: '風險', catalyst: '催化', valuation: '估值', macro: '總經' }
  return labels[value]
}

function sentimentLabel(value: NonNullable<SummaryItem['evidenceClaims']>[number]['sentiment']) {
  const labels = { bullish: '偏多', neutral: '中性', bearish: '偏空', mixed: '混合' }
  return labels[value]
}

function sentimentTone(value: NonNullable<SummaryItem['evidenceClaims']>[number]['sentiment']) {
  if (value === 'bullish') return 'violet'
  if (value === 'bearish' || value === 'mixed') return 'amber'
  return 'neutral'
}

function riskLevelLabel(value: NonNullable<SummaryItem['watchlistInsights']>[number]['riskLevel']) {
  const labels = { low: '低', medium: '中', high: '高' }
  return labels[value]
}

function riskTone(value: NonNullable<SummaryItem['watchlistInsights']>[number]['riskLevel']) {
  if (value === 'high') return 'amber'
  if (value === 'medium') return 'violet'
  return 'neutral'
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.max(0, Math.floor(seconds % 60))
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export default Shell
