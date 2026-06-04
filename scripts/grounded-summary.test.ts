import assert from 'node:assert/strict'
import type { RawContentItem } from '../src/lib/types'
import { buildGroundedSummaryFromArtifacts } from './shared'

const raw: RawContentItem = {
  id: 'test-item',
  sourceId: 'yutinghao',
  externalId: 'test',
  medium: 'podcast',
  title: '市場測試',
  description: '只有 metadata 的 fallback 內容',
  publishedAt: '2026-06-04T00:00:00.000Z',
  url: 'https://example.com/test',
  fetchedAt: '2026-06-04T00:00:00.000Z',
}

const summary = buildGroundedSummaryFromArtifacts(
  raw,
  [
    {
      claim: '这波行情走得并不平均，资金集中在台韩市场，美元计价表现明显领先美股大盘。',
      claimType: 'macro',
      entities: ['entity-currency-美元-usd'],
      tickers: ['USD'],
      sentiment: 'mixed',
      confidence: 0.91,
      evidence: { quote: '这波行情走得并不平均' },
    },
    {
      claim: '这四个议题没那么容易谈拢，布兰特原油价格上涨反映市场仍在评价地缘风险。',
      claimType: 'risk',
      entities: ['entity-commodity-原油'],
      tickers: [],
      sentiment: 'mixed',
      confidence: 0.9,
      evidence: { quote: '布兰特原油价格上涨' },
    },
  ],
  [
    { id: 'entity-currency-美元-usd', canonicalName: '美元', type: 'currency', ticker: 'USD' },
    { id: 'entity-commodity-原油', canonicalName: '原油', type: 'commodity' },
  ],
)

assert.equal(summary.id, raw.id)
assert.ok(summary.body.includes('通過門檻的主張'))
assert.ok(summary.keyPoints.length >= 2 && summary.keyPoints.length <= 5)
assert.ok(summary.keyPoints.every((point) => /[。！？…]$/.test(point)))
assert.ok(summary.keyPoints.join(' ').includes('資金表現集中'))
assert.ok(!summary.keyPoints.join(' ').includes('这波行情'))
assert.deepEqual([...summary.mentionedAssets].sort(), ['USD', '原油'])
assert.ok(summary.risks.some((risk) => risk.includes('原油')))

const fallback = buildGroundedSummaryFromArtifacts(raw, [], [])
assert.equal(fallback.sourceTextQuality, 'metadata-only')
assert.ok(!fallback.body.includes('通過門檻的主張'))

console.log('grounded-summary tests passed')
