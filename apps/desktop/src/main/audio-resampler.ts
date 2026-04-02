import type { AudioFormat } from '@openbroca/audio-capture'
import type { RecognitionInput } from '@openbroca/providers/asr'

function int16BytesToSamples(chunks: Uint8Array[]): Int16Array {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new Int16Array(merged.buffer)
}

function samplesToBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer.slice(0))
}

function resampleMonoInt16(samples: Int16Array, fromSampleRate: number, toSampleRate: number): Int16Array {
  if (samples.length === 0 || fromSampleRate === toSampleRate) {
    return new Int16Array(samples)
  }

  const outputLength = Math.max(1, Math.round((samples.length * toSampleRate) / fromSampleRate))
  const output = new Int16Array(outputLength)
  const step = fromSampleRate / toSampleRate

  for (let index = 0; index < outputLength; index++) {
    const sourceIndex = index * step
    const leftIndex = Math.floor(sourceIndex)
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1)
    const weight = sourceIndex - leftIndex
    const interpolated =
      samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight

    output[index] = Math.max(-32768, Math.min(32767, Math.round(interpolated)))
  }

  return output
}

export function normalizeRecordingForASR(recording: {
  format: AudioFormat
  chunks: Uint8Array[]
}): Uint8Array[] {
  if (
    recording.format.sampleRate === 16000 &&
    recording.format.channels === 1 &&
    recording.format.bitDepth === 16
  ) {
    return recording.chunks
  }

  if (recording.format.channels !== 1 || recording.format.bitDepth !== 16) {
    throw new Error(
      `Unsupported recording format for ASR normalization: ${recording.format.channels}ch ${recording.format.bitDepth}-bit @ ${recording.format.sampleRate}Hz`
    )
  }

  const samples = int16BytesToSamples(recording.chunks)
  const resampled = resampleMonoInt16(samples, recording.format.sampleRate, 16000)
  return [samplesToBytes(resampled)]
}

export function buildRecognitionInput(recording: {
  format: AudioFormat
  chunks: Uint8Array[]
}): RecognitionInput {
  const normalizedChunks = normalizeRecordingForASR(recording)
  return {
    audio: normalizedChunks,
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1
  }
}
