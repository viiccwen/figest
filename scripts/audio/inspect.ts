import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type AudioInspection = {
  durationSeconds?: number
  codec?: string
  sampleRate?: number
  channels?: number
  warnings: string[]
}

type FfprobeStream = {
  codec_type?: string
  codec_name?: string
  sample_rate?: string | number
  channels?: string | number
}

type FfprobeOutput = {
  streams?: FfprobeStream[]
  format?: {
    duration?: string | number
  }
}

export async function inspectAudio(inputUrlOrPath: string): Promise<AudioInspection> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputUrlOrPath,
      ],
      { timeout: 1000 * 60 * 2, maxBuffer: 1024 * 1024 * 4 },
    )

    const warnings = stderr.trim() ? [`ffprobe stderr: ${stderr.trim()}`] : []
    const parsed = JSON.parse(stdout) as FfprobeOutput
    const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio')

    return {
      durationSeconds: parseOptionalNumber(parsed.format?.duration),
      codec: audioStream?.codec_name,
      sampleRate: parseOptionalNumber(audioStream?.sample_rate),
      channels: parseOptionalNumber(audioStream?.channels),
      warnings,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { warnings: [`ffprobe failed: ${message}`] }
  }
}

function parseOptionalNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
