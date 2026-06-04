export type WatchlistConfig = {
  key: string
  name: string
  description: string
  matchTerms: string[]
}

export const watchlists: WatchlistConfig[] = [
  {
    key: 'semis-ai',
    name: '半導體 / AI',
    description: '追蹤半導體、AI 供應鏈與相關大型科技股。',
    matchTerms: ['2330', 'TSM', 'NVDA', 'AMD', 'ASML', '台積電', '半導體', 'AI', '光通', 'ASIC', 'AIPC'],
  },
  {
    key: 'macro-rates',
    name: '總經 / 利率',
    description: '追蹤 Fed、通膨、就業、利率與美元債券市場。',
    matchTerms: ['Fed', 'CPI', 'PCE', 'FOMC', '非農就業', '非農', '利率', '通膨', '美債殖利率', '美債', '殖利率', '美元', '降息', '升息'],
  },
  {
    key: 'taiwan-market',
    name: '台灣市場',
    description: '追蹤台股、台積電、台幣與台灣半導體題材。',
    matchTerms: ['台股', '0050', 'TWD', '台幣', '台積電', '2330', 'TSM', '半導體'],
  },
  {
    key: 'crypto-risk',
    name: '加密風險',
    description: '追蹤 Bitcoin、ETF 資金流與加密市場風險。',
    matchTerms: ['Bitcoin', 'BTC', '比特幣', 'ETF', '資金流出', '風險'],
  },
]
