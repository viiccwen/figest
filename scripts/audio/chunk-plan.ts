export type SilenceRange = {
  start: number
  end: number
}

export type AudioChunk = {
  index: number
  start: number
  end: number
  boundary: 'silence' | 'fixed' | 'duration'
}

export type ChunkPlanningOptions = {
  durationSeconds?: number
  maxChunkSeconds: number
  minChunkSeconds: number
  boundaryToleranceSeconds: number
}

export type ChunkPlan = {
  strategy: 'fixed' | 'silence-aware'
  chunks: AudioChunk[]
  silenceBoundaryCount: number
  warnings: string[]
}

const EPSILON = 0.001

export function planAudioChunks(silences: SilenceRange[], options: ChunkPlanningOptions): ChunkPlan {
  const warnings: string[] = []
  const maxChunkSeconds = Math.max(EPSILON, options.maxChunkSeconds)
  const minChunkSeconds = Math.max(EPSILON, Math.min(options.minChunkSeconds, maxChunkSeconds))
  const tolerance = Math.max(0, options.boundaryToleranceSeconds)
  const duration = normalizeDuration(options.durationSeconds)

  if (!duration) {
    return {
      strategy: 'fixed',
      chunks: [],
      silenceBoundaryCount: 0,
      warnings: ['silence-aware chunking skipped: audio duration unavailable'],
    }
  }

  const usefulBoundaries = normalizeSilenceBoundaries(silences, duration)
  if (usefulBoundaries.length === 0 && duration > maxChunkSeconds) {
    return {
      strategy: 'fixed',
      chunks: planFixedChunks(duration, maxChunkSeconds),
      silenceBoundaryCount: 0,
      warnings: ['silence-aware chunking fell back to fixed chunks: no useful silence boundaries detected'],
    }
  }

  const chunks: AudioChunk[] = []
  let start = 0

  while (duration - start > maxChunkSeconds + EPSILON) {
    const target = start + maxChunkSeconds
    const minEnd = start + minChunkSeconds
    const maxEnd = Math.min(duration, target + tolerance)
    const candidates = usefulBoundaries.filter((boundary) => boundary > minEnd && boundary >= target - tolerance && boundary <= maxEnd)
    const boundary = candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]

    if (boundary !== undefined) {
      chunks.push({ index: chunks.length, start, end: roundSeconds(boundary), boundary: 'silence' })
      start = boundary
    } else {
      chunks.push({ index: chunks.length, start, end: roundSeconds(target), boundary: 'fixed' })
      start = target
    }
  }

  if (duration - start > EPSILON) {
    chunks.push({ index: chunks.length, start: roundSeconds(start), end: roundSeconds(duration), boundary: 'duration' })
  }

  const compacted = mergeTinyTail(chunks, minChunkSeconds, maxChunkSeconds, tolerance)
  const finalSilenceBoundaryCount = compacted.filter((chunk) => chunk.boundary === 'silence').length

  if (finalSilenceBoundaryCount === 0 && compacted.length > 1) {
    return {
      strategy: 'fixed',
      chunks: planFixedChunks(duration, maxChunkSeconds),
      silenceBoundaryCount: 0,
      warnings: ['silence-aware chunking fell back to fixed chunks: detected silences were too sparse or outside tolerance'],
    }
  }

  return {
    strategy: finalSilenceBoundaryCount > 0 ? 'silence-aware' : 'fixed',
    chunks: compacted.map((chunk, index) => ({ ...chunk, index, start: roundSeconds(chunk.start), end: roundSeconds(chunk.end) })),
    silenceBoundaryCount: finalSilenceBoundaryCount,
    warnings,
  }
}

export function planFixedChunks(durationSeconds: number, segmentSeconds: number): AudioChunk[] {
  const duration = normalizeDuration(durationSeconds)
  if (!duration) return []

  const segment = Math.max(EPSILON, segmentSeconds)
  const chunks: AudioChunk[] = []
  for (let start = 0; start < duration - EPSILON; start += segment) {
    chunks.push({
      index: chunks.length,
      start: roundSeconds(start),
      end: roundSeconds(Math.min(duration, start + segment)),
      boundary: Math.min(duration, start + segment) >= duration ? 'duration' : 'fixed',
    })
  }
  return chunks
}

export function parseSilencedetectOutput(output: string): SilenceRange[] {
  const silences: SilenceRange[] = []
  let pendingStart: number | undefined

  for (const line of output.split('\n')) {
    const startMatch = /silence_start:\s*([0-9.]+)/.exec(line)
    if (startMatch) {
      pendingStart = Number(startMatch[1])
      continue
    }

    const endMatch = /silence_end:\s*([0-9.]+)/.exec(line)
    if (endMatch && pendingStart !== undefined) {
      const end = Number(endMatch[1])
      if (Number.isFinite(pendingStart) && Number.isFinite(end) && end > pendingStart) {
        silences.push({ start: pendingStart, end })
      }
      pendingStart = undefined
    }
  }

  return silences
}

function normalizeSilenceBoundaries(silences: SilenceRange[], duration: number): number[] {
  return Array.from(
    new Set(
      silences
        .map((silence) => (silence.start + silence.end) / 2)
        .filter((boundary) => Number.isFinite(boundary) && boundary > EPSILON && boundary < duration - EPSILON)
        .map(roundSeconds),
    ),
  ).sort((a, b) => a - b)
}

function mergeTinyTail(chunks: AudioChunk[], minChunkSeconds: number, maxChunkSeconds: number, tolerance: number): AudioChunk[] {
  if (chunks.length < 2) return chunks
  const last = chunks[chunks.length - 1]
  const previous = chunks[chunks.length - 2]
  if (last.end - last.start >= minChunkSeconds) return chunks
  if (last.end - previous.start > maxChunkSeconds + tolerance) return chunks

  return [
    ...chunks.slice(0, -2),
    {
      ...previous,
      end: last.end,
      boundary: last.boundary,
    },
  ]
}

function normalizeDuration(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= EPSILON) return undefined
  return value
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000
}
