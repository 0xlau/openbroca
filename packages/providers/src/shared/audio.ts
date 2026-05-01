import { TranscriptionError } from './errors.ts'
import type { RecognitionInput } from '../asr/contracts.ts'

/**
 * Throws an AbortError if the signal is already aborted.
 * Mirrors the DOM AbortError shape (`name === 'AbortError'`) so
 * standard utilities (e.g. fetch) recognize it as cancellation.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return

  const error = new Error('Recognition aborted')
  error.name = 'AbortError'
  throw error
}

/**
 * Normalizes any RecognitionInput.audio shape into an AsyncIterable<Uint8Array>.
 * Single buffers and arrays are wrapped; existing async iterables pass through.
 */
export function normalizeAudioChunks(
  audio: RecognitionInput['audio']
): AsyncIterable<Uint8Array> {
  if (isAsyncIterable(audio)) {
    return audio
  }

  const chunks = Array.isArray(audio) ? audio : [audio]
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  if (!value) return false
  return typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
}

/**
 * Asserts that the input is plain 16 kHz mono PCM (linear16) — the format both
 * deepgram and sherpa-onnx default to. Providers that need other formats should
 * not use this helper.
 */
export function assertPCMInput(providerId: string, input: RecognitionInput, message: string): void {
  if (input.mimeType) {
    throw new TranscriptionError(providerId, message)
  }
  if (input.encoding && input.encoding !== 'linear16') {
    throw new TranscriptionError(providerId, message)
  }
  if (input.sampleRate !== undefined && input.sampleRate !== 16000) {
    throw new TranscriptionError(providerId, message)
  }
  if (input.channels !== undefined && input.channels !== 1) {
    throw new TranscriptionError(providerId, message)
  }
}
