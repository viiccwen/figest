import assert from 'node:assert/strict'
import { parseSilencedetectOutput, planAudioChunks, planFixedChunks } from './audio/chunk-plan'
import { getAudioPreprocessingConfig } from './audio/preprocess'

const silencedetectLog = `
[silencedetect @ 0x1] silence_start: 89.5
[silencedetect @ 0x1] silence_end: 91.5 | silence_duration: 2
[silencedetect @ 0x1] silence_start: 181
[silencedetect @ 0x1] silence_end: 183 | silence_duration: 2
`

const silences = parseSilencedetectOutput(silencedetectLog)
assert.deepEqual(silences, [
  { start: 89.5, end: 91.5 },
  { start: 181, end: 183 },
])

const silenceAware = planAudioChunks(silences, {
  durationSeconds: 250,
  maxChunkSeconds: 90,
  minChunkSeconds: 30,
  boundaryToleranceSeconds: 5,
})
assert.equal(silenceAware.strategy, 'silence-aware')
assert.deepEqual(
  silenceAware.chunks.map((chunk) => ({ start: chunk.start, end: chunk.end, boundary: chunk.boundary })),
  [
    { start: 0, end: 90.5, boundary: 'silence' },
    { start: 90.5, end: 182, boundary: 'silence' },
    { start: 182, end: 250, boundary: 'duration' },
  ],
)

const sparse = planAudioChunks([{ start: 10, end: 12 }], {
  durationSeconds: 250,
  maxChunkSeconds: 90,
  minChunkSeconds: 30,
  boundaryToleranceSeconds: 5,
})
assert.equal(sparse.strategy, 'fixed')
assert.deepEqual(
  sparse.chunks.map((chunk) => [chunk.start, chunk.end]),
  [
    [0, 90],
    [90, 180],
    [180, 250],
  ],
)
assert.match(sparse.warnings.join('\n'), /fell back to fixed chunks/)

assert.deepEqual(
  planFixedChunks(185, 60).map((chunk) => [chunk.start, chunk.end, chunk.boundary]),
  [
    [0, 60, 'fixed'],
    [60, 120, 'fixed'],
    [120, 180, 'fixed'],
    [180, 185, 'duration'],
  ],
)

const envFallbackConfig = getAudioPreprocessingConfig({
  ENABLE_AUDIO_VAD: '',
  AUDIO_VAD_ENABLED: 'true',
  AUDIO_MAX_CHUNK_SECONDS: '',
  WHISPER_MAX_CHUNK_SECONDS: '123',
  AUDIO_MIN_CHUNK_SECONDS: '999',
} as NodeJS.ProcessEnv)
assert.equal(envFallbackConfig.vadEnabled, true)
assert.equal(envFallbackConfig.maxChunkSeconds, 123)
assert.equal(envFallbackConfig.minChunkSeconds, 123)

console.log('audio chunk planning tests passed')
