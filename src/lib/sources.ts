import type { SourceConfig } from './types'

export const sources: SourceConfig[] = [
  {
    id: 'gooaye',
    slug: 'gooaye',
    name: 'Gooaye 股癌',
    kind: 'podcast-rss',
    feedUrl: 'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml',
    homepage: 'https://player.soundon.fm/p/954689a5-3096-43a4-a80b-7810b219cef3',
    description: '從 Podcast RSS 自動偵測最新集數；MVP 先用 show notes 摘要，之後可接 Whisper 轉錄音訊。',
    accent: 'violet',
  },
  {
    id: 'yutinghao',
    slug: 'yutinghao',
    name: '游庭皓的財經皓角',
    kind: 'youtube-rss',
    feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC0lbAQVpenvfA2QqzsRtL_g',
    fallbackFeedUrls: ['https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss'],
    homepage: 'https://www.youtube.com/channel/UC0lbAQVpenvfA2QqzsRtL_g',
    description: '優先從 YouTube Atom feed 自動偵測最新影片；若 YouTube feed 暫時 404/5xx，會 fallback 到公開 podcast RSS。',
    accent: 'blue',
  },
]

export function sourceById(id: string) {
  return sources.find((source) => source.id === id)
}
