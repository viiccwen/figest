# Audio Intelligence Pipeline 改造規劃

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 把目前「ffmpeg 固定切段 → Whisper ASR → 純文字摘要」升級成 evidence-grounded 的財經音訊理解 pipeline，支援 timestamp、segment、claim、ticker/entity、watchlist insight。

**Architecture:** 保留 GitHub Actions batch workflow 與 static site，不急著導入常駐 API server。先以 provider-adapter + structured JSON artifacts 改造 pipeline；heavy ASR/VAD/diarization 優先走 managed provider，財經 correction / extraction / grounded summary 由 repo 內 pipeline 掌控。

**Tech Stack:** pnpm, TypeScript, Node 22, ffmpeg, Vite/React static site, GitHub Actions, Whisper-compatible ASR provider, JSON artifacts.

---

## 現況基準

目前 `scripts/transcribe.ts`：

```text
raw.audioUrl
→ ffmpeg 轉 mono / 16kHz / 32kbps
→ 固定 900 秒切段
→ 每段 POST WHISPER_API_URL
→ 只保留 text
→ content/transcripts/items/*.json
```

目前缺口：

- 無 VAD / silence-aware chunking
- 無 speaker diarization
- 無 word/segment timestamps
- 無 forced alignment / timestamp cleanup
- 無 finance term correction
- 無 transcript segmentation
- 無 claim/ticker/entity extraction
- 無 evidence-grounded summary
- 無 watchlist insight

---

## 目標資料流

```text
content/raw/items/*.json
  ↓
content/audio-manifests/items/*.json
  ↓
content/transcripts/raw/*.json
  ↓
content/transcripts/normalized/*.json
  ↓
content/segments/items/*.json
  ↓
content/entities/items/*.json
content/claims/items/*.json
  ↓
content/summaries/items/*.json
  ↓
content/insights/items/*.json
  ↓
src/data/generated/index.json
public/data/summaries/index.json
```

---

## 核心原則

1. **前端只讀 structured artifacts**：React site 不做 ASR、LLM、抽取，只 render JSON。
2. **ASR provider 可替換**：不要把 OpenAI/Whisper-compatible 細節散落在 pipeline。
3. **先 structured，再漂亮 summary**：先建立 timestamp/evidence/claim schema，再優化文案。
4. **每一步可 cache / resume**：已產生的 transcript、segments、claims 不重跑，除非 `--force`。
5. **重任務 bounded**：保留 `WHISPER_TRANSCRIBE_LIMIT`、timeout、per-item skip。
6. **品質門檻可測**：每個 artifact 有 zod/schema 驗證與 content-quality checks。

---

## Phase 0：Schema 與目錄改造

**Objective:** 先定義新 pipeline 的 artifacts，不改 provider 行為。

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `scripts/shared.ts`
- Create: `content/audio-manifests/items/.gitkeep`
- Create: `content/transcripts/raw/.gitkeep`
- Create: `content/transcripts/normalized/.gitkeep`
- Create: `content/segments/items/.gitkeep`
- Create: `content/entities/items/.gitkeep`
- Create: `content/claims/items/.gitkeep`
- Create: `content/insights/items/.gitkeep`

**Add types:**

```ts
export type AudioManifest = {
  id: string
  rawItemId: string
  sourceId: string
  audioUrl: string
  fetchedAt: string
  durationSeconds?: number
  codec?: string
  sampleRate?: number
  channels?: number
  preprocessing: {
    targetSampleRate: 16000
    channels: 1
    bitrate: string
    segmentSeconds?: number
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
```

**Verification:**

```bash
pnpm lint
pnpm build
```

---

## Phase 1：Transcription provider adapter

**Objective:** 把 `scripts/transcribe.ts` 拆成 provider adapter，保留目前 Whisper-compatible API，但輸出 raw transcript artifact。

**Files:**
- Create: `scripts/transcription/providers.ts`
- Create: `scripts/transcription/whisper-compatible.ts`
- Modify: `scripts/transcribe.ts`

**Design:**

```ts
export type TranscriptionProvider = {
  name: string
  transcribe(filePath: string, options: TranscribeOptions): Promise<{
    text: string
    segments?: TranscriptSegment[]
    warnings?: string[]
  }>
}
```

**Implementation notes:**

- 目前 Whisper-compatible `response_format=json` 只回 text，先把每個 900 秒 chunk 映射成 synthetic segment：
  - `start = index * segmentSeconds`
  - `end = (index + 1) * segmentSeconds`
- 如果 provider 支援 verbose JSON，之後再加 `WHISPER_RESPONSE_FORMAT=verbose_json`。
- 保留 4 次 retry 與 5xx backoff。

**Verification:**

```bash
WHISPER_TRANSCRIBE_LIMIT=1 pnpm transcribe
pnpm lint
pnpm build
```

---

## Phase 2：Audio manifest + preprocessing hardening

**Objective:** 把目前 ffmpeg 邏輯顯式化，記錄音訊 metadata 與 preprocessing 設定。

**Files:**
- Create: `scripts/audio/inspect.ts`
- Create: `scripts/audio/preprocess.ts`
- Modify: `scripts/transcribe.ts`
- Modify: `.github/workflows/daily-digest.yml`

**Tasks:**

1. 用 `ffprobe` 讀 duration / codec / sampleRate / channels。
2. 產出 `content/audio-manifests/items/${raw.id}.json`。
3. 轉檔輸出仍使用 temp dir，不 commit audio。
4. 加 env：
   - `AUDIO_TARGET_SAMPLE_RATE=16000`
   - `AUDIO_TARGET_BITRATE=32k`
   - `AUDIO_SEGMENT_SECONDS=900`
5. GitHub Actions 加 `timeout-minutes`，避免卡死。

**Verification:**

```bash
pnpm transcribe -- --limit=1
pnpm quality:content
```

---

## Phase 3：VAD / silence-aware chunking，可選 provider-first

**Objective:** 用 silence-aware chunking 取代純固定 900 秒切段；先不用上 full diarization。

**Files:**
- Create: `scripts/audio/chunk.ts`
- Modify: `scripts/transcribe.ts`

**MVP approach:**

先用 ffmpeg silence detection：

```bash
ffmpeg -i input.mp3 -af silencedetect=noise=-35dB:d=0.5 -f null -
```

產生 chunk boundary：

- chunk 目標長度：5–10 分鐘
- 優先切在 silence point
- 最長不超過 provider limit
- 最短小於 20 秒的 chunk 併回前段

**Do not overbuild:**

- 暫不導入 pyannote / GPU diarization。
- 若 provider 本身支援 VAD/diarization/timestamps，優先使用 provider output。

**Verification:**

- 每個 chunk 有 start/end。
- chunk 不重疊。
- 全部 chunk coverage 接近 audio duration。

---

## Phase 4：Transcript normalization + finance term correction

**Objective:** 建立財經詞彙校正層，讓 ASR 錯字在摘要前被修正。

**Files:**
- Create: `src/lib/finance-glossary.ts`
- Create: `scripts/transcript/normalize.ts`
- Modify: `package.json`

**Glossary examples:**

```ts
export const financeGlossary = [
  { canonical: '台積電', aliases: ['台積', 'tsmc', 'TSMC'], ticker: '2330', exchange: 'TWSE' },
  { canonical: '輝達', aliases: ['Nvidia', '英偉達'], ticker: 'NVDA', exchange: 'NASDAQ' },
  { canonical: '聯準會', aliases: ['Fed', 'FED', '美國央行'], type: 'macro' },
  { canonical: '非農就業', aliases: ['NFP', '非農'], type: 'macro' },
]
```

**Script:**

```bash
pnpm normalize:transcripts
```

**Verification:**

- 輸出 `content/transcripts/normalized/*.json`。
- `corrections[]` 記錄 from/to/count。
- 不直接覆蓋 raw transcript。

---

## Phase 5：Transcript segmentation

**Objective:** 把 transcript 切成可閱讀、可引用、可摘要的 topic segments。

**Files:**
- Create: `scripts/transcript/segment.ts`
- Modify: `package.json`

**Segmentation rules MVP:**

- 以 transcript segments 為基礎。
- 每段目標 500–1200 中文字。
- 遇到明顯 topic marker 切段：
  - ticker / company shift
  - macro keyword shift
  - 主持人轉場詞
  - 長 silence boundary
- 每個 segment 保留 start/end/source text。

**Output:**

```text
content/segments/items/${raw.id}.json
```

---

## Phase 6：Entity / ticker extraction

**Objective:** 從 segments 抽出可索引的公司、ticker、人物、總經 topic。

**Files:**
- Create: `scripts/extract/entities.ts`
- Create: `src/lib/entity-rules.ts`
- Modify: `package.json`

**Approach:**

1. Deterministic glossary match first。
2. Regex ticker match second。
3. Optional LLM extraction later。
4. Canonicalize aliases。

**Verification:**

- 台積電 / TSMC / 2330 合併成同一 entity。
- Nvidia / 輝達 / NVDA 合併成同一 entity。
- 每個 entity 有 evidenceSegmentIds。

---

## Phase 7：Claim extraction

**Objective:** 把 segments 轉成 evidence-backed claims，供 summary 與 watchlist 使用。

**Files:**
- Create: `scripts/extract/claims.ts`
- Modify: `package.json`

**MVP rules:**

- 先 deterministic：含有 forecast/risk/catalyst/valuation/macro keywords 的句子抽 claim。
- 每個 claim 必須有：
  - segmentId
  - quote
  - start/end
  - entities/tickers
  - confidence
- LLM 只可用來 refine，不可無 evidence 生成 claim。

**Quality gate:**

- 無 evidence quote 的 claim fail。
- claim quote 必須存在於 segment text。
- confidence 必須 0–1。

---

## Phase 8：Grounded summary rewrite

**Objective:** 讓 `scripts/summarize.ts` 改用 segments + claims，而不是只用 transcript text heuristic。

**Files:**
- Modify: `scripts/summarize.ts`
- Modify: `src/lib/types.ts`
- Modify: `scripts/content-quality.ts`

**Summary rules:**

- keyPoints 必須來自 claim 或 segment evidence。
- mentionedAssets 來自 entity/ticker extraction。
- risks 來自 risk claims + standard disclaimer。
- body 使用 zh-TW editorial style，避免逐字稿感。
- 若無 transcript/claims，fallback 到 show-notes heuristic。

**Verification:**

- `sourceTextQuality='transcript'` 的 summary 至少有 1 個 evidence-backed keyPoint。
- 不再出現沒有來源根據的 ticker。

---

## Phase 9：Watchlist / insight generation

**Objective:** 基於 entities/claims 產生 watchlist insights。

**Files:**
- Create: `src/lib/watchlist.ts`
- Create: `scripts/insights/watchlist.ts`
- Modify: `scripts/build-digest.ts`
- Modify: frontend components as needed

**MVP watchlist config:**

```ts
export const defaultWatchlist = [
  { key: 'semis', tickers: ['2330', 'TSM', 'NVDA', 'AMD', 'ASML'], label: '半導體 / AI 供應鏈' },
  { key: 'macro', topics: ['Fed', 'CPI', 'PCE', 'NFP', '利率'], label: '美國總經與利率' },
]
```

**Output:**

```text
content/insights/items/${raw.id}.json
```

---

## Phase 10：Frontend evidence UX

**Objective:** 在 static site 呈現更高品質資料，而不是只列摘要。

**Files:**
- Modify: `src/...` existing summary/detail components
- Add if needed: `src/components/EvidenceBadge.tsx`
- Add if needed: `src/components/ClaimList.tsx`
- Add if needed: `src/components/InsightCard.tsx`

**UI additions:**

- 每篇 summary 顯示：
  - 來源品質：metadata/show-notes/transcript/evidence-backed
  - mentioned tickers/entities
  - top claims
  - evidence timestamp
  - watchlist insight cards

---

## Phase 11：GitHub Actions guardrails

**Objective:** 控制成本、時間與 generated data size。

**Files:**
- Modify: `.github/workflows/daily-digest.yml`
- Modify: `scripts/check-content-quality.ts`

**Add env/vars:**

```yaml
AUDIO_SEGMENT_SECONDS: ${{ vars.AUDIO_SEGMENT_SECONDS || '900' }}
ENABLE_AUDIO_VAD: ${{ vars.ENABLE_AUDIO_VAD || 'false' }}
ENABLE_CLAIM_EXTRACTION: ${{ vars.ENABLE_CLAIM_EXTRACTION || 'true' }}
ENABLE_WATCHLIST_INSIGHTS: ${{ vars.ENABLE_WATCHLIST_INSIGHTS || 'true' }}
```

**Guardrails:**

- job `timeout-minutes: 30` initially。
- transcribe limit default remains 2。
- skip failed item, do not fail whole deploy unless schema validation fails。
- generated artifact size warning。

---

## 推薦實作順序

1. Phase 0 schema/dirs
2. Phase 1 provider adapter
3. Phase 2 manifest/preprocessing metadata
4. Phase 4 finance glossary normalization
5. Phase 5 segmentation
6. Phase 6 entity/ticker extraction
7. Phase 7 claim extraction
8. Phase 8 grounded summary
9. Phase 9 watchlist insights
10. Phase 10 frontend UX
11. Phase 3 VAD chunking refinement

**Why Phase 3 later:** VAD 很有價值，但先把 downstream evidence/claim schema 建起來，才能衡量 VAD 對品質是否真的有提升。

---

## 是否需要 API server？

現階段不需要。建議繼續使用：

```text
GitHub Actions scheduled batch
→ provider ASR API
→ repo scripts post-process
→ static JSON
→ GitHub Pages
```

需要 API server / worker 的觸發條件：

- 使用者即時提交 URL / upload audio
- 多使用者 watchlist
- Telegram bot realtime query
- job progress dashboard
- 每天大量音訊、GitHub Actions runtime 不夠
- 需要 queue/retry/persistence

在那之前，最多只需要 background worker，不需要 full API server。

---

## Multi-agent 分工建議

- **Agent A — Pipeline/schema:** Phase 0–2，負責 artifacts、provider adapter、GitHub Actions guardrails。
- **Agent B — Finance intelligence:** Phase 4–8，負責 glossary、segmentation、entities、claims、grounded summary。
- **Agent C — Product/frontend:** Phase 9–10，負責 watchlist insight schema 與 UI 呈現。
- **Reviewer agent:** 每個 phase 後做 schema consistency、content-quality、lint/build review。

---

## Acceptance criteria

- `pnpm pipeline` 可在沒有 ASR key 時 fallback metadata pipeline。
- 有 ASR key 時產出 raw transcript + normalized transcript + segments。
- Summary 的 key points 至少能追溯到 segment/claim evidence。
- Entities/tickers 來自 deterministic canonicalization，不是 summary hallucination。
- GitHub Actions 每日 job 仍可在 30 分鐘內完成 MVP workload。
- Frontend build/lint 通過。
- Deployed JSON 不含 stale provider/demo 文案。
