import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { TranscriptionProvider, TranscriptionResult, TranscribeOptions } from './providers'

export type WhisperCompatibleProviderConfig = {
  apiUrl: string
  apiKey: string
  model?: string
  language?: string
  attempts?: number
}

export function createWhisperCompatibleProvider(config: WhisperCompatibleProviderConfig): TranscriptionProvider {
  const attempts = config.attempts ?? 4

  return {
    name: 'whisper-compatible',
    async transcribe(filePath: string, options: TranscribeOptions): Promise<TranscriptionResult> {
      const { text, warnings } = await transcribeWithRetry(filePath, options, config, attempts)
      return {
        text,
        warnings,
        segments: [
          {
            id: options.segmentId,
            start: options.segmentStart,
            end: options.segmentEnd,
            text,
          },
        ],
      }
    },
  }
}

async function transcribeWithRetry(
  filePath: string,
  options: TranscribeOptions,
  config: WhisperCompatibleProviderConfig,
  attempts: number,
) {
  let lastError = 'Whisper API failed without details'
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: await buildFormData(filePath, options, config),
      })

      if (response.ok) {
        const data = await response.json() as unknown
        return parseSuccessfulResponse(data)
      }

      const detail = await readResponseText(response)
      lastError = `Whisper API failed ${response.status}: ${detail.slice(0, 500)}`
      if (response.status < 500) throw new NonRetryableTranscriptionError(lastError)
      if (attempt === attempts) break
      console.warn(`  retrying segment after ${response.status} (${attempt}/${attempts})`)
      await sleep(2_000 * attempt)
    } catch (error) {
      if (error instanceof NonRetryableTranscriptionError) throw error

      lastError = `Whisper API request failed: ${formatError(error)}`
      if (attempt === attempts) break
      console.warn(`  retrying segment after transient error (${attempt}/${attempts}): ${formatError(error)}`)
      await sleep(2_000 * attempt)
    }
  }

  throw new Error(lastError)
}

function parseSuccessfulResponse(data: unknown): Pick<TranscriptionResult, 'text' | 'warnings'> {
  if (!isRecord(data) || !('text' in data)) {
    return {
      text: '',
      warnings: ['Whisper API success response did not include a text field; using an empty transcript.'],
    }
  }

  if (typeof data.text !== 'string') {
    return {
      text: '',
      warnings: [`Whisper API success response text field was ${typeof data.text}; using an empty transcript.`],
    }
  }

  return { text: data.text.trim(), warnings: [] }
}

async function readResponseText(response: Response) {
  try {
    return await response.text()
  } catch (error) {
    return `<failed to read response body: ${formatError(error)}>`
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

class NonRetryableTranscriptionError extends Error {}

async function buildFormData(filePath: string, options: TranscribeOptions, config: WhisperCompatibleProviderConfig) {
  const bytes = await readFile(filePath)
  const form = new FormData()
  const model = config.model ?? options.model
  const language = config.language ?? options.language
  if (model) form.set('model', model)
  form.set('language', language)
  form.set('response_format', 'json')
  form.set('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(filePath))
  return form
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
