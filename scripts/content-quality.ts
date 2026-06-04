const phraseMap: Record<string, string> = {
  欢迎: '歡迎', 收听: '收聽', 节目: '節目', 赞助: '贊助', 资讯: '資訊', 专属: '專屬', 链接: '連結', 结账: '結帳', 优惠: '優惠', 购买: '購買', 账号: '帳號', 网络: '網路', 连线: '連線', 支援: '支援', 装置: '裝置', 实用: '實用', 旅游: '旅遊', 规划: '規劃', 时候: '時候', 价格: '價格', 国家: '國家', 地区: '地區', 差异: '差異', 控制预算: '控制預算', 保障: '保障', 公共网络: '公共網路', 资料: '資料', 付款: '付款', 稳定: '穩定', 影响: '影響', 国外: '國外', 台湾: '台灣', 常用服务: '常用服務', 解决: '解決', 非常: '非常', 好用: '好用', 过: '過', 这个: '這個', 这: '這', 那: '那', 会: '會', 说: '說', 对: '對', 为: '為', 个: '個', 们: '們', 后: '後', 里: '裡', 着: '著', 与: '與', 于: '於', 从: '從', 还: '還', 发: '發', 华: '華', 关: '關', 广: '廣', 产: '產', 业: '業', 经: '經', 济: '濟', 价: '價', 亿: '億', 万: '萬', 台积电: '台積電', 辉达: '輝達', 黄仁勋: '黃仁勳', 美股: '美股', 总经: '總經', 加密货币: '加密貨幣', 比特币: '比特幣', 半导体: '半導體', 市场: '市場', 资金: '資金', 风险: '風險', 投资: '投資', 货币: '貨幣', 轮动: '輪動', 关税: '關稅', 降息: '降息', 通膨: '通膨', 利率: '利率', 供应链: '供應鏈', 经济: '經濟', 美国: '美國', 日本: '日本', 韩国: '韓國', 中国: '中國', 议题: '議題', 动态: '動態', 学习: '學習', 证券: '證券', 买卖: '買賣', 建议: '建議', 声明: '聲明', 风味: '風味', 业务: '業務', 这种: '這種', 场合: '場合', 认真: '認真', 觉得: '覺得', 开心: '開心', 运: '運', 转: '轉', 开: '開', 点: '點', 线: '線', 体: '體', 观: '觀', 认: '認', 门: '門', 问: '問', 题: '題', 现: '現', 亲: '親', 电: '電', 脑: '腦', 手机: '手機', 平板: '平板', 电脑: '電腦', 当前: '當前', 顶: '頂', 会计: '會計', 发债: '發債', 增资: '增資', 追价: '追價', 刚: '剛', 开始: '開始', 估值: '估值', 谷歌: '谷歌', 游戏: '遊戲', 就业: '就業', 达成: '達成', 目标: '目標', 开盘: '開盤', 解读: '解讀', 时事: '時事', 频道: '頻道', 误区: '誤區', 奥秘: '奧秘', 风险: '風險', 持盈保泰: '持盈保泰', 礼: '禮', 满: '滿', 获: '獲', 续: '續', 践: '踐', 动: '動', 样: '樣', 让: '讓', 买: '買', 卖: '賣', 赶: '趕', 干: '乾', 类: '類', 边: '邊', 间: '間', 终: '終', 帮: '幫', 忆: '憶', 乐: '樂', 么: '麼', 没: '沒', 请: '請', 厅: '廳', 处: '處', 蛮: '蠻', 别: '別', 带: '帶', 进: '進', 间: '間', 办: '辦', 实: '實', 范围: '範圍', 失败: '失敗', 贡献: '貢獻', 相关: '相關', 见: '見', 当: '當', 办法: '辦法', 距离: '距離', 终点: '終點', 东西: '東西', 气候: '氣候', 比较: '比較', 笔電: '筆電', 测试: '測試', 盘面: '盤面', 整個: '整個', 洞能: '動能', 技术: '技術', 数字: '數字', 光通: '光通', 标的: '標的', 标股: '標股', 认知: '認知', 掌握: '掌握', 讨论: '討論', 应该: '應該', 喷: '噴', 单: '單', 习惯: '習慣', 龙头: '龍頭', 位置: '位置', 会不會: '會不會', 已经: '已經', 现在: '現在', 后面: '後面', 时候: '時候', 看起来: '看起來', 没有: '沒有', 还是: '還是', 起来: '起來', 可能: '可能'
}

const promotionPatterns = [
  /nord\s*vpn/i,
  /本集節目由|本集節目由.+贊助|贊助播出/,
  /業配|廣告|工商服務|優惠碼|折扣碼|專屬連結|結帳.*輸入|資訊欄.*連結|退款保證|立即享有/,
  /參加財經皓角|新友會員|老友會員|粉絲專頁|網站參加會員手冊|打賞網址|不提供退款服務|歡迎來信/,
  /訂閱|會員|贊助商|合作邀約/,
  /善存|葉黃素|液態軟膠囊|維他命|85折|人體實驗研究|曲線下面積|直接打\d+折|Momo|限時優惠|好吸收|有神保養|手刀買進/,
  /https?:\/\//i,
]

const boilerplatePatterns = [
  /《早晨財經速解讀》是游庭皓的個人知識節目.*$/,
  /免責聲明[:：].*$/,
  /開盤前30分鐘，?\s*08:30\s*-\s*09:00\s*讓我們一起解讀財經時事[。\s]*/,
]

export function toZhTw(input = '') {
  let text = input.normalize('NFKC')
  const entries = Object.entries(phraseMap).sort((a, b) => b[0].length - a[0].length)
  for (const [from, to] of entries) text = text.replaceAll(from, to)
  return text
    .replace(/,/g, '，')
    .replace(/\s*\?/g, '？')
    .replace(/\s*!/g, '！')
    .replace(/\s+([，。！？；：])/g, '$1')
    .replace(/([，。！？；：])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripPromotionalContent(input = '') {
  let text = toZhTw(input)
  for (const pattern of boilerplatePatterns) text = text.replace(pattern, ' ')

  const sponsorIndex = findFirstPromoIndex(text)
  if (sponsorIndex >= 0 && sponsorIndex < 1600) {
    const rest = text.slice(sponsorIndex)
    const anchors = ['好，那', '好那', '那過去', '今天', '回到', '接下來', '市場', '這一集']
    const cuts = anchors.map((anchor) => rest.indexOf(anchor)).filter((i) => i > 80)
    if (cuts.length) text = text.slice(sponsorIndex + Math.min(...cuts))
  }

  const units = splitText(text)
  return units
    .filter((unit) => !isPromotion(unit) || unit.length > 500)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildQualitySummary(raw: { title: string; description?: string }, transcriptText?: string) {
  const hasTranscript = Boolean(transcriptText?.trim())
  const sourceText = hasTranscript ? transcriptText! : raw.description || raw.title
  const cleaned = stripPromotionalContent(sourceText)
  const title = toZhTw(raw.title)
  const chunks = splitText(cleaned)
    .map((chunk) => cleanupChunk(chunk))
    .filter((chunk) => chunk.length >= 18 && chunk.length <= 180)
    .filter((chunk) => !isPromotion(chunk))

  const picked = pickRepresentativeChunks(chunks, `${title} ${cleaned}`)
  const fallback = stripPromotionalContent(raw.description || title) || title
  const topics = inferTopics(`${title} ${cleaned}`)
  const assets = inferAssets(`${title} ${cleaned}`)
  const keyPoints = buildEditorialKeyPoints({ title, topics, assets, hasTranscript, picked, fallback })

  while (keyPoints.length < 3) {
    keyPoints.push(buildFallbackPoint(title, topics, keyPoints.length))
  }

  const tldr = buildTldr(title, keyPoints, topics)
  const body = [
    `TL;DR：${tldr}`,
    '',
    '重點摘要：',
    ...keyPoints.map((point) => `- ${point}`),
    '',
    `內容品質：${hasTranscript ? '已使用 Whisper 逐字稿，並移除偵測到的業配 / 會員推廣片段後整理。' : '使用 RSS show notes，並移除偵測到的業配 / 會員推廣片段後整理。'}`,
    '提醒：摘要為自動化資訊整理，不構成投資建議；重要數字與脈絡請回原節目查證。',
  ].join('\n')

  return { cleanedText: cleaned, keyPoints, body, excerpt: keyPoints.join(' '), topics, mentionedAssets: assets }
}

function buildEditorialKeyPoints(input: { title: string; topics: string[]; assets: string[]; hasTranscript: boolean; picked: string[]; fallback: string }) {
  const { title, topics, assets, hasTranscript, picked, fallback } = input
  const points: string[] = []
  const titleText = toZhTw(title)
  const topicText = topics.length ? topics.slice(0, 4).join('、') : '本集主題'
  const weakTitle = isWeakEpisodeTitle(titleText)
  const evidencePoints = picked.map((chunk) => summarizeEvidenceChunk(chunk, topics)).filter(Boolean)
  const uniqueEvidencePoints = [...new Set(evidencePoints)]

  if (!weakTitle) {
    points.push(`本集聚焦「${titleText}」，主軸可先放在 ${topicText}。`)
  } else if (uniqueEvidencePoints[0]) {
    points.push(uniqueEvidencePoints[0])
  } else {
    points.push(`本集主軸可先放在 ${topicText}。`)
  }

  for (const point of uniqueEvidencePoints) {
    if (points.length >= 4) break
    if (!points.includes(point)) points.push(point)
  }

  if (assets.length && points.length < 4) {
    points.push(`節目中可追蹤的資產 / 公司包含：${assets.slice(0, 5).join('、')}；這裡僅作內容索引，不代表買賣建議。`)
  }

  if ((topics.includes('總經') || titleText.includes('關稅')) && points.length < 4) {
    points.push('總經與政策變數會影響風險偏好；若內容提到關稅、利率或資金流，應搭配後續市場反應觀察。')
  }

  if (!hasTranscript || picked.length < 2) {
    const fallbackTitle = splitText(fallback)[0]
    points.push(`目前可用內容有限，系統保守整理為標題 / show notes 摘要；建議回原節目確認完整脈絡${fallbackTitle && fallbackTitle !== titleText ? `（可參考：${ensureSentence(toZhTw(fallbackTitle))}）` : '。'}`)
  }

  return points.map(ensureSentence).filter(Boolean).slice(0, 4)
}

function buildTldr(title: string, keyPoints: string[], topics: string[]) {
  const titleText = toZhTw(title)
  if (!isWeakEpisodeTitle(titleText)) {
    return `本集從 ${topics.slice(0, 3).join('、') || '主要財經議題'} 切入，重點是把標題事件放回資金流、產業鏈與風險管理脈絡中理解。`
  }
  const first = keyPoints[0]?.replace(/[。！？]$/, '')
  return first ? `本集重點在於${first.replace(/^本集/, '')}，並搭配風險控管角度閱讀。` : '本集以可辨識主題做保守整理，重要細節請回原節目確認。'
}

function isWeakEpisodeTitle(title: string) {
  return /^EP\d+\s*\|\s*\p{Extended_Pictographic}+$/u.test(title.trim()) || title.replace(/[\s\p{Extended_Pictographic}|。！？!?]/gu, '').length <= 6
}

function summarizeEvidenceChunk(chunk: string, topics: string[]) {
  const text = toZhTw(chunk)
  if (/融資|額度|維持率|借款|部位|加碼|槓桿|券商/.test(text)) return '節目提到部位、借款額度與維持率等操作細節，提醒在行情強勢時也要管理流動性與槓桿風險。'
  if (/交易量|報酬率|方法論|四個數字|下得準|受傷/.test(text)) return '主持人把重點放在交易方法論，而不是單純給標的或數字；核心是建立可重複的判斷流程。'
  if (/生活步調|儀式感|感受生命|專注在生活|節奏放慢|下背/.test(text)) return '本集前段從生活節奏與身體狀態切入，延伸到交易者如何降低急躁、保留觀察力與決策品質。'
  if (/關稅|貿易|強迫勞動|稅率/.test(text)) return '本集把關稅與貿易政策視為重要變數，重點在政策理由、稅率變化與市場是否已提前反映。'
  if (/資金|輪動|補漲|熱點|成交量|盤面/.test(text)) return '節目多次討論資金輪動與熱點切換，觀察重點是主流題材外溢、補漲族群與成交量能否延續。'
  if (/AI|半導體|晶片|光通|ASIC|AIPC|PC|NVIDIA|輝達|台積電/.test(text)) return 'AI / 半導體仍是核心線索，但摘要重點不只看大型龍頭，也要觀察光通、AIPC、ASIC 與零組件等延伸需求。'
  if (/比特幣|Bitcoin|BTC|加密|現貨/.test(text)) return '比特幣與加密資產相關討論偏向高波動風險線索，需同時觀察 ETF 資金流與整體風險情緒。'
  if (/Google|Alphabet|谷歌|發債|增資|募資|估值/.test(text)) return '大型科技公司的發債、增資與估值變化是本集觀察點，會牽動市場對資金需求與追價空間的判斷。'
  if (/ETF|巨獸|0050|006208/.test(text)) return 'ETF 規模化與資金集中效應是重要脈絡，需留意被動資金流入如何改變個股與市場結構。'
  if (topics.includes('總經')) return '節目提到總經條件與市場情緒交互影響，後續應追蹤利率、通膨、就業與匯率等變數。'
  return ''
}

function buildFallbackPoint(title: string, topics: string[], index: number) {
  if (index === 0) return `本集主題為「${toZhTw(title)}」。`
  if (topics.includes('AI') || topics.includes('半導體')) return '若要延伸追蹤，可把 AI 算力需求、半導體供應鏈與終端裝置復甦分開觀察。'
  if (topics.includes('總經')) return '後續觀察重點包括利率、通膨、就業與匯率，避免只用單一事件解讀市場。'
  if (topics.includes('台股')) return '台股相關討論可搭配成交量、族群輪動與權值股表現交叉檢查。'
  return '摘要保守整理可辨識主題，重要細節仍建議回原節目確認。'
}

function findFirstPromoIndex(text: string) {
  const indexes = promotionPatterns
    .map((pattern) => text.search(pattern))
    .filter((index) => index >= 0)
  return indexes.length ? Math.min(...indexes) : -1
}

function splitText(text: string) {
  return text
    .replace(/(那再來|再來就是|接下來|另外|但是|不過|所以|今天|市場|美股|台股|AI|半導體|台積電|輝達|比特幣|關稅|利率|通膨|就業)/g, '\n$1')
    .replace(/([。！？!?；;])\s*/g, '$1\n')
    .replace(/(\d{1,2}:\d{2})/g, '\n$1')
    .split(/\n|(?<=，)\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function cleanupChunk(chunk: string) {
  return chunk
    .replace(/^[，。！？；：\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[0-9]{1,2}:[0-9]{2}\s*/, '')
    .trim()
}

function isPromotion(text: string) {
  const normalized = toZhTw(text)
  return promotionPatterns.some((pattern) => pattern.test(normalized))
}

function ensureSentence(text: string) {
  const trimmed = text.trim().replace(/[，；：]+$/, '')
  if (!trimmed) return ''
  return /[。！？]$/.test(trimmed) ? trimmed : `${trimmed}。`
}

function pickRepresentativeChunks(chunks: string[], fullText: string) {
  const seen = new Set<string>()
  return chunks
    .map((chunk, index) => ({ chunk, score: scoreChunk(chunk, fullText) - index * 0.01 }))
    .sort((a, b) => b.score - a.score)
    .map(({ chunk }) => chunk)
    .filter((chunk) => {
      const key = chunk.slice(0, 28)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
}

function scoreChunk(chunk: string, fullText: string) {
  let score = Math.min(chunk.length, 120) / 40
  const keywords = ['市場', '美股', '台股', 'AI', 'ETF', '利率', '通膨', '關稅', '比特幣', '半導體', '台積電', '輝達', '風險', '資金', '估值', '就業', '經濟']
  for (const keyword of keywords) if (chunk.includes(keyword)) score += 1.4
  const topicCount = inferTopics(`${chunk} ${fullText}`).length
  score += topicCount * 0.4
  if (/^[我你他]|覺得|開心|吃|喝|飯店|品酒|孩子/.test(chunk)) score -= 1.2
  return score
}

export function inferTopics(text: string) {
  const dictionary: Record<string, string[]> = {
    AI: ['AI', '人工智慧', '輝達', 'NVIDIA', 'Agentic'],
    ETF: ['ETF'],
    台股: ['台股', '台積電', '加權', '台廠'],
    美股: ['美股', 'Nasdaq', 'S&P', '標普', '費半'],
    總經: ['通膨', '利率', 'Fed', '降息', '關稅', '匯率', '就業'],
    半導體: ['半導體', '晶片', '台積電', '輝達'],
    加密貨幣: ['比特幣', 'Bitcoin', 'BTC', '加密'],
  }
  return Object.entries(dictionary).filter(([, keys]) => keys.some((key) => text.includes(key))).map(([topic]) => topic)
}

export function inferAssets(text: string) {
  const assets = ['台積電', 'NVIDIA', '輝達', 'Bitcoin', 'BTC', '0050', '006208']
  return assets.filter((asset) => text.includes(asset))
}
