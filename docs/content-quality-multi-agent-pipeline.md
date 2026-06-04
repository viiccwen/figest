# Multi-agent 內容品質 Pipeline 設計

目標：把 RSS / 逐字稿整理成可讀的 zh-TW 財經摘要，而不是逐字稿摘句；同時移除業配、會員推廣與投資建議風險。

## 建議流程

```text
Raw RSS / Audio
  → Ingest Agent
  → Transcription Agent
  → Ad & Boilerplate Filter Agent
  → Topic Structuring Agent
  → zh-TW Editorial Summary Agent
  → Compliance / Risk Review Agent
  → Publisher Agent
```

## Agent 職責

1. **Ingest Agent**
   - 下載 RSS / Atom / podcast feed。
   - 正規化標題、來源、發布時間、原始連結、音訊連結。
   - 僅保存 raw JSON，不直接產生前端資料。

2. **Transcription Agent**
   - 有 `WHISPER_API_KEY` 才轉錄音訊；`WHISPER_API_URL` 可選，未設定時使用預設 Whisper-compatible endpoint。
   - 限制每日轉錄數量，避免 GitHub Actions 成本失控。
   - 產物標註 model、language、segmentCount、transcribedAt。

3. **Ad & Boilerplate Filter Agent**
   - 偵測並移除：贊助商開場、優惠碼、專屬連結、會員 / 打賞 / 合作邀約、show-note 罐頭聲明、商品促銷段落。
   - 若可用內容移除後不足，回傳 `metadata-only` 並提示需回原節目確認，不硬湊摘要。

4. **Topic Structuring Agent**
   - 從清理後內容抽出主題、資產、總經事件、風險與時間線。
   - 將逐字稿斷成章節候選，不直接使用長句當摘要。

5. **zh-TW Editorial Summary Agent**
   - 使用繁體中文、台灣用語。
   - 輸出固定 schema：`TL;DR`、`重點摘要`、`市場脈絡`、`風險 / 待查證`。
   - 禁止輸出原逐字稿長句；每點應改寫成 1–2 句可讀摘要。

6. **Compliance / Risk Review Agent**
   - 檢查：是否殘留業配、是否混入簡體、是否像逐字稿、是否有買賣建議語氣、是否捏造數字。
   - 未通過則退回前一個 agent 重新生成。

7. **Publisher Agent**
   - 只發布通過 review 的 summary JSON。
   - 更新 `src/data/generated/index.json` 與 `public/data/summaries/index.json`。
   - 執行 lint / build / browser smoke test。

## Gate 設計

- **Pre-flight gate**：Feed 可讀、日期合理、音訊連結有效。
- **Revision gate**：業配殘留、簡體殘留、逐字稿語氣過重就重跑摘要。
- **Escalation gate**：內容不足、轉錄失敗、RSS 只有廣告時標註 metadata-only，不假裝有摘要。
- **Abort gate**：schema 不合法、JSON 無法被前端讀取、build 失敗則不發布。

## 目前已落地的 MVP

- `scripts/content-quality.ts`：加入 zh-TW 正規化、業配 / boilerplate 過濾、主題與資產推斷、品質提示。
- `scripts/shared.ts`：摘要產生改由 content-quality helper 處理。
- 已清空並重新產生 `content/summaries/items/*.json`、`src/data/generated/index.json`、`public/data/summaries/index.json`。

## 下一階段建議

- 接上真正 LLM reviewer / editor：目前 MVP 仍是 deterministic heuristic，能移除業配與改善格式，但還不是完整新聞編輯等級摘要。
- 加入 OpenCC / zhconv：避免 Whisper 簡體詞殘留；目前先用內建詞表轉換。
- 建立 golden tests：固定樣本包含 NordVPN、會員推廣、商品促銷、純 metadata-only 節目，避免未來回歸。
