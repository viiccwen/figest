export type SourceKind = 'podcast-rss' | 'youtube-rss'

export type SourceConfig = {
  id: string
  slug: string
  name: string
  kind: SourceKind
  feedUrl: string
  fallbackFeedUrls?: string[]
  homepage: string
  description: string
  accent: 'violet' | 'blue'
}

export type RawContentItem = {
  id: string
  sourceId: string
  externalId: string
  medium: 'podcast' | 'youtube'
  title: string
  description: string
  publishedAt: string
  url: string
  audioUrl?: string
  imageUrl?: string
  fetchedAt: string
}

export type TranscriptItem = {
  id: string
  rawItemId: string
  sourceId: string
  title: string
  audioUrl: string
  transcribedAt: string
  model: string
  language?: string
  segmentCount: number
  text: string
}

export type AudioManifest = {
  id: string
  rawItemId: string
  sourceId: string
  audioUrl: string
  fetchedAt: string
  metadata: {
    durationSeconds?: number
    codec?: string
    sampleRate?: number
    channels?: number
    warnings: string[]
  }
  preprocessing: {
    targetSampleRate: number
    channels: number
    bitrate: string
    segmentSeconds: number
    vadEnabled: boolean
  }
}

export type TranscriptWord = {
  text: string
  start?: number
  end?: number
  confidence?: number
}

export type TranscriptSegment = {
  id: string
  start: number
  end: number
  speaker?: string
  text: string
  words?: TranscriptWord[]
  providerSegmentId?: string
}

export type RawTranscriptArtifact = {
  id: string
  rawItemId: string
  sourceId: string
  provider: string
  model: string
  language?: string
  transcribedAt: string
  audioUrl: string
  segments: TranscriptSegment[]
  text: string
  warnings: string[]
}

export type NormalizedTranscriptArtifact = RawTranscriptArtifact & {
  normalizedAt: string
  corrections: Array<{
    from: string
    to: string
    reason: 'finance-glossary' | 'ticker-alias' | 'manual-rule'
    count: number
  }>
}

export type TopicSegment = {
  id: string
  rawItemId: string
  sourceId: string
  title: string
  start: number
  end: number
  text: string
  speakerIds: string[]
  topics: string[]
  mentionedAssets: string[]
  importance: 'low' | 'medium' | 'high'
}

export type ExtractedEntity = {
  id: string
  canonicalName: string
  aliases: string[]
  type: 'company' | 'ticker' | 'person' | 'macro' | 'currency' | 'commodity' | 'topic'
  ticker?: string
  exchange?: string
  evidenceSegmentIds: string[]
}

export type ExtractedClaim = {
  id: string
  rawItemId: string
  segmentId: string
  claim: string
  claimType: 'fact' | 'forecast' | 'opinion' | 'risk' | 'catalyst' | 'valuation' | 'macro'
  entities: string[]
  tickers: string[]
  sentiment: 'bullish' | 'neutral' | 'bearish' | 'mixed'
  confidence: number
  evidence: {
    start: number
    end: number
    quote: string
  }
}

export type WatchlistInsight = {
  id: string
  rawItemId: string
  watchlistKey: string
  title: string
  summary: string
  relatedTickers: string[]
  claimIds: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

export type SummaryItem = {
  id: string
  sourceId: string
  sourceName: string
  sourceSlug: string
  title: string
  url: string
  publishedAt: string
  summarizedAt: string
  excerpt: string
  keyPoints: string[]
  body: string
  topics: string[]
  mentionedAssets: string[]
  sentiment: '偏多' | '中性' | '偏空' | '混合' | '資訊不足'
  risks: string[]
  sourceTextQuality: 'metadata-only' | 'show-notes' | 'transcript'
}

export type DigestIndex = {
  generatedAt: string
  timezone: string
  disclaimer: string
  summaries: SummaryItem[]
}
