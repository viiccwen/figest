import type { TranscriptSegment } from '../../src/lib/types'

export type TranscribeOptions = {
  model: string
  language: string
  segmentStart: number
  segmentEnd: number
  segmentId: string
}

export type TranscriptionResult = {
  text: string
  segments?: TranscriptSegment[]
  warnings?: string[]
}

export type TranscriptionProvider = {
  name: string
  transcribe(filePath: string, options: TranscribeOptions): Promise<TranscriptionResult>
}
