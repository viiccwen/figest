import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

type SummaryItem = {
  id?: string
  title?: string
  excerpt?: string
  keyPoints?: unknown
  body?: string
  risks?: unknown
}

type DigestIndex = {
  disclaimer?: string
  summaries?: SummaryItem[]
}

type Failure = {
  file: string
  id: string
  check: string
  detail: string
}

const rootDir = process.cwd()
const summaryDir = path.join(rootDir, 'content/summaries/items')
const publicIndexPath = path.join(rootDir, 'public/data/summaries/index.json')
const generatedIndexPath = path.join(rootDir, 'src/data/generated/index.json')

const expectedDisclaimer = '本網站摘要由 AI 自動生成，僅供資訊整理與學習參考，不構成投資建議；請以原始節目內容與正式資訊為準。'
const bodyDisclaimer = '提醒：摘要為自動化資訊整理，不構成投資建議；重要數字與脈絡請回原節目查證。'

const sponsorPatterns = [
  /https?:\/\//i,
  /nord\s*vpn/i,
  /本集(?:節目)?由.+(?:贊助|合作|播出)/,
  /贊助(?:播出|商)|業配|工商服務|合作邀約/,
  /優惠碼|折扣碼|專屬連結|資訊欄.*連結|結帳.*輸入|立即享有|限時優惠|退款保證/,
  /會員手冊|新友會員|老友會員|打賞網址|不提供退款服務|粉絲專頁|歡迎來信/,
  /善存|葉黃素|液態軟膠囊|維他命|85折|Momo|手刀買進|好吸收|有神保養/,
]

const simplifiedPatterns = [
  /[欢听赞资讯专属链账优购线实规时价异稳响湾决过这会说对为个们后里与从还发关广产经亿辉勋总货轮动税议学证买卖声风觉转开点观认门问题现亲脑顶刚盘频误奥获续践让赶类边间终帮忆乐么没请厅处蛮别带进办贡见当东气测标讨应喷单惯龙]/,
  /台积电|黄仁勋|美股总经|加密货币|比特币|半导体|市场|资金|风险|投资|货币|供应链|经济|美国|韩国|证券|建议|声明|当前|开盘|频道|范围|失败|见解|办法|终点|技术|数字|标的|认知|讨论|应该|习惯|龙头/,
]

const fillerPatterns = [
  /目前可用內容有限/,
  /資訊不足/,
  /建議搭配原始節目確認完整脈絡/,
]

const transcriptLikePatterns = [
  /\b\d{1,2}:\d{2}\b/,
  /(嗯|呃|那個|就是說|對不對).*(嗯|呃|那個|就是說|對不對)/,
]

const failures: Failure[] = []

const files = (await readdir(summaryDir)).filter((file) => file.endsWith('.json')).sort()
for (const file of files) {
  const filePath = path.join(summaryDir, file)
  const summary = await readJson<SummaryItem>(filePath)
  checkSummary(filePath, summary)
}

await checkIndex(publicIndexPath)
await checkIndex(generatedIndexPath)

if (failures.length) {
  console.error(`Content quality check failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`- ${failure.file} [${failure.id}] ${failure.check}: ${failure.detail}`)
  }
  process.exit(1)
}

console.log(`Content quality check passed for ${files.length} summary file(s) and 2 index file(s).`)

function checkSummary(filePath: string, summary: SummaryItem) {
  const rel = path.relative(rootDir, filePath)
  const id = summary.id || path.basename(filePath, '.json')
  const keyPoints = Array.isArray(summary.keyPoints) ? summary.keyPoints.filter((value): value is string => typeof value === 'string') : []
  const body = summary.body || ''
  const excerpt = summary.excerpt || ''
  const risks = Array.isArray(summary.risks) ? summary.risks.filter((value): value is string => typeof value === 'string') : []

  if (keyPoints.length < 3) add(rel, id, 'structure', `expected at least 3 keyPoints, got ${keyPoints.length}`)
  if (!body.startsWith('TL;DR：')) add(rel, id, 'structure', 'body must start with TL;DR：')
  for (const required of ['重點摘要：', '內容品質：', bodyDisclaimer]) {
    if (!body.includes(required)) add(rel, id, 'structure', `body is missing required section/text: ${required}`)
  }

  const bulletCount = body.split('\n').filter((line) => line.startsWith('- ')).length
  if (bulletCount !== keyPoints.length) add(rel, id, 'structure', `body bullet count (${bulletCount}) does not match keyPoints (${keyPoints.length})`)
  const tldr = body.match(/^TL;DR：(.+)$/m)?.[1]?.trim() || ''
  if (tldr && normalizeBullet(tldr) === normalizeBullet(keyPoints[0] || '')) add(rel, id, 'template-duplication', 'TL;DR duplicates first keyPoint')
  if (!risks.some((risk) => risk.includes('不構成投資建議') || risk.includes('買賣建議'))) add(rel, id, 'structure', 'risks must include investment-advice caution')

  const checkedText = stripAllowedQualityLanguage([excerpt, ...keyPoints, body].join('\n'))
  const sponsorHit = sponsorPatterns.find((pattern) => pattern.test(checkedText))
  if (sponsorHit) add(rel, id, 'sponsor-leakage', `matched ${sponsorHit}`)

  const simplifiedHits = simplifiedPatterns.flatMap((pattern) => Array.from(checkedText.matchAll(new RegExp(pattern.source, `${pattern.flags}g`)), (match) => match[0]))
  const uniqueSimplifiedHits = [...new Set(simplifiedHits)]
  if (uniqueSimplifiedHits.length > 3) add(rel, id, 'simplified-chinese-drift', `found ${uniqueSimplifiedHits.slice(0, 8).join('、')}`)

  const normalizedPoints = keyPoints.map(normalizeBullet)
  const duplicates = normalizedPoints.filter((point, index) => normalizedPoints.indexOf(point) !== index)
  if (duplicates.length) add(rel, id, 'duplicate-bullets', `duplicate keyPoints after normalization: ${[...new Set(duplicates)].join(' / ')}`)

  const fillerCount = keyPoints.filter((point) => fillerPatterns.some((pattern) => pattern.test(point))).length
  if (fillerCount > 1) add(rel, id, 'filler-bullets', `too many generic/fallback keyPoints (${fillerCount})`)

  keyPoints.forEach((point, index) => {
    if (point.length > 220) add(rel, id, 'transcript-like-keypoint', `keyPoints[${index}] is ${point.length} chars; max is 220`)
    const transcriptHit = transcriptLikePatterns.find((pattern) => pattern.test(point))
    if (transcriptHit) add(rel, id, 'transcript-like-keypoint', `keyPoints[${index}] matched ${transcriptHit}`)
    if (!/[。！？]$/.test(point.trim())) add(rel, id, 'structure', `keyPoints[${index}] must end with zh-TW sentence punctuation`)
  })
}

async function checkIndex(filePath: string) {
  const rel = path.relative(rootDir, filePath)
  const index = await readJson<DigestIndex>(filePath)
  if (index.disclaimer !== expectedDisclaimer) add(rel, 'index', 'structure', 'index disclaimer does not match expected zh-TW disclaimer')
  if (!Array.isArray(index.summaries)) add(rel, 'index', 'structure', 'index summaries must be an array')
}

function stripAllowedQualityLanguage(text: string) {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('內容品質：'))
    .join('\n')
}

function normalizeBullet(text: string) {
  return text.normalize('NFKC').replace(/[\s，。！？；：、,.!?;:「」『』()（）【】]/g, '').toLowerCase()
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

function add(file: string, id: string, check: string, detail: string) {
  failures.push({ file, id, check, detail })
}
