import path from 'node:path'
import type { RawContentItem } from '../src/lib/types'
import { buildIndex, ensureDirs, generatedDir, heuristicSummary, publicDataDir, rawDir, summaryDir, writeJson } from './shared'

const now = new Date().toISOString()
const demoItems: RawContentItem[] = [
  {
    id: 'gooaye-demo-ai-etf',
    sourceId: 'gooaye',
    externalId: 'demo-gooaye-ai-etf',
    medium: 'podcast',
    title: 'EP Demo | AI、ETF 與市場情緒',
    description: '本集聊到 AI 產業熱度、ETF 資金流與台股投資人情緒。主持人提醒短線題材熱時更要注意部位與風險，不應只看單一消息追高。',
    publishedAt: now,
    url: 'https://player.soundon.fm/p/954689a5-3096-43a4-a80b-7810b219cef3',
    fetchedAt: now,
  },
  {
    id: 'yutinghao-demo-morning-market',
    sourceId: 'yutinghao',
    externalId: 'demo-yutinghao-morning-market',
    medium: 'podcast',
    title: 'Demo 早晨財經速解讀：關稅、降息與美股輪動',
    description: '今日重點包含美股科技股輪動、Fed 降息預期、關稅政策對供應鏈的影響，以及 ETF 巨獸化後對市場波動的可能改變。',
    publishedAt: now,
    url: 'https://soundcloud.com/l9j0totnyhgh',
    fetchedAt: now,
  },
]

await ensureDirs()
const summaries = demoItems.map(heuristicSummary)
for (const item of demoItems) await writeJson(path.join(rawDir, `${item.id}.json`), item)
for (const summary of summaries) await writeJson(path.join(summaryDir, `${summary.id}.json`), summary)
const index = buildIndex(summaries)
await writeJson(path.join(generatedDir, 'index.json'), index)
await writeJson(path.join(publicDataDir, 'index.json'), index)
console.log('Seeded demo finance digest content.')
