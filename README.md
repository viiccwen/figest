# 財經節目 Digest

自動抓取股癌與財經皓角公開 RSS / YouTube feed，產生結構化摘要 JSON，並用 Vite + React + TailwindCSS 呈現成靜態網站。

## Stack

- pnpm
- Vite + TypeScript + React
- TailwindCSS v4
- shadcn-style UI primitives (`class-variance-authority`, `tailwind-merge`)
- Tailwind CSS Animated (`tw-animate-css`)
- `fast-xml-parser` RSS / Atom ingestion

## Local commands

```bash
pnpm install --config.minimum-release-age=0
pnpm seed:demo
pnpm pipeline
pnpm dev
```

Pipeline steps:

```bash
pnpm ingest -- --limit=3
pnpm transcribe -- --limit=1   # optional: requires Whisper API env vars
pnpm summarize
pnpm digest
```

`pnpm pipeline` runs ingest → transcribe → summarize → digest. If Whisper credentials are not configured yet, use `pnpm pipeline:metadata` to keep the MVP on RSS / YouTube show notes only.

Generated files:

- `content/raw/items/*.json` — normalized raw RSS / YouTube feed items
- `content/transcripts/items/*.json` — Whisper transcript JSON for podcast audio
- `content/summaries/items/*.json` — generated per-item summaries
- `src/data/generated/index.json` — bundled static site data
- `public/data/summaries/index.json` — public JSON endpoint

## Sources

- Gooaye 股癌 podcast RSS: `https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml`
- 游庭皓的財經皓角 YouTube Atom: `https://www.youtube.com/feeds/videos.xml?channel_id=UC0lbAQVpenvfA2QqzsRtL_g`
- 財經皓角 fallback podcast RSS: `https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss`

YouTube Atom can transiently return 404/5xx, so the ingestion script retries and then falls back to podcast RSS.

## MVP summary quality

Current MVP uses title + public show notes / media description and intentionally generates conservative summaries. It does **not** republish full transcripts.

When Whisper is enabled, podcast audio is converted by `ffmpeg` into small mono MP3 segments and sent to an OpenAI-compatible `/audio/transcriptions` endpoint. Set the key as a GitHub Actions secret and the endpoint as a GitHub Actions variable:

```bash
WHISPER_API_KEY=...
WHISPER_API_URL=https://api.openai.com/v1/audio/transcriptions
WHISPER_MODEL=whisper-1
WHISPER_LANGUAGE=zh
```

The scheduled workflow only enables transcription when both `WHISPER_API_KEY` and `WHISPER_API_URL` are configured; otherwise it safely falls back to metadata-only digest generation.

Future upgrade path:

1. YouTube transcript extraction when captions are available.
2. Podcast audio download + Whisper transcription quality tuning.
3. LLM strict JSON summarization using `OPENAI_API_KEY` or another provider.
4. Topic pages, weekly digest, Telegram push.

## Disclaimer

本網站摘要由 AI 自動生成，僅供資訊整理與學習參考，不構成投資建議；請以原始節目內容與正式資訊為準。
