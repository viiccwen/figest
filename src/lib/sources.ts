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
    kind: 'podcast-rss',
    feedUrl: 'https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss',
    homepage: 'https://soundcloud.com/l9j0totnyhgh',
    description: '從 Podcast RSS 自動偵測最新集數；MVP 先用 show notes 摘要，之後可接 Whisper 轉錄音訊。',
    accent: 'blue',
  },
]

export function sourceById(id: string) {
  return sources.find((source) => source.id === id)
}
