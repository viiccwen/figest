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
