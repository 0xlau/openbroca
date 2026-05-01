import { createClient } from '@deepgram/sdk'
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import { AsyncPushQueue } from '../../../shared/async-queue.ts'
import { assertPCMInput, normalizeAudioChunks, throwIfAborted } from '../../../shared/audio.ts'
import type {
  RecognitionInput,
  RecognitionOptions,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent,
  TranscriptionSegment,
} from '../../contracts.ts'

const PCM_INPUT_ERROR = 'Recognition metadata is not supported for prerecorded transcription'

export interface DeepgramConfig {
  apiKey: string
}

export class DeepgramASRProvider implements StreamingASRProvider {
  readonly id = 'deepgram'
  readonly displayName = 'Deepgram'

  private apiKey: string

  constructor(config: DeepgramConfig) {
    this.apiKey = config.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  async recognize(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): Promise<RecognitionResult> {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    throwIfAborted(options?.signal)
    assertPCMInput(this.id, input, PCM_INPUT_ERROR)
    const audio = await collectAudioBuffer(input.audio, options?.signal)
    throwIfAborted(options?.signal)
    const client = createClient(this.apiKey)
    const requestOptions: Record<string, unknown> = {
      model: 'nova-2',
      language: options?.language ?? 'en',
      smart_format: true,
      utterances: true,
    }

    if (input.encoding) {
      requestOptions.encoding = input.encoding
    }
    if (input.sampleRate !== undefined) {
      requestOptions.sample_rate = input.sampleRate
    }
    if (input.channels !== undefined) {
      requestOptions.channels = input.channels
    }

    const { result, error } = await client.listen.prerecorded.transcribeFile(audio, requestOptions)

    if (error) {
      throw new TranscriptionError(this.id, error.message, error)
    }

    if (!result) {
      throw new TranscriptionError(this.id, 'Deepgram returned no transcription result')
    }

    const utterances = result.results.utterances
    const segments = utterances?.length
      ? utterances.map((utterance) => {
          const segment: TranscriptionSegment = {
            text: utterance.transcript,
            isFinal: true,
          }

          if (utterance.start != null) {
            segment.startTime = utterance.start
          }
          if (utterance.end != null) {
            segment.endTime = utterance.end
          }

          return segment
        })
      : buildFallbackSegments(result.results.channels?.[0]?.alternatives?.[0])

    const text = segments.map((segment) => segment.text).join(' ').trim()

    return {
      text,
      segments,
    }
  }

  async *transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    const audio = normalizeAudioChunks(input.audio)
    const client = createClient(this.apiKey)
    const queue = new AsyncPushQueue<TranscriptionEvent>()

    const connection = client.listen.live({
      model: 'nova-2',
      language: options?.language ?? 'en',
      smart_format: true,
      encoding: input.encoding ?? 'linear16',
      sample_rate: input.sampleRate ?? 16000,
      channels: input.channels,
      interim_results: true,
    })

    connection.on('Results', (data: {
      channel: { alternatives: Array<{ transcript: string }> }
      is_final: boolean
      start?: number
      duration?: number
    }) => {
      const transcript = data.channel.alternatives[0]?.transcript ?? ''
      if (!transcript) return

      const segment: TranscriptionSegment = {
        text: transcript,
        isFinal: data.is_final,
      }
      if (data.start != null) {
        segment.startTime = data.start
      }
      if (data.start != null && data.duration != null) {
        segment.endTime = data.start + data.duration
      }

      queue.push({
        type: data.is_final ? 'final' : 'interim',
        segment,
      })
    })

    connection.on('error', (err: Error) => {
      queue.fail(new TranscriptionError(this.id, err.message, err))
    })

    connection.on('close', () => {
      queue.end()
    })

    const sendAudio = async () => {
      try {
        for await (const chunk of audio) {
          if (options?.signal?.aborted) break
          connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
        }
      } finally {
        connection.requestClose()
      }
    }
    void sendAudio()

    yield* queue.drain()
  }
}

async function collectAudioBuffer(
  audio: RecognitionInput['audio'],
  signal?: AbortSignal
): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of normalizeAudioChunks(audio)) {
    throwIfAborted(signal)
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
  }

  throwIfAborted(signal)
  return Buffer.concat(chunks)
}

function buildFallbackSegments(
  alternative?: {
    transcript?: string
    words?: Array<{ start?: number; end?: number }>
  }
): TranscriptionSegment[] {
  const transcript = alternative?.transcript ?? ''
  if (!transcript) return []

  const segment: TranscriptionSegment = {
    text: transcript,
    isFinal: true,
  }

  const words = alternative?.words
  if (words && words.length > 0) {
    const start = words[0]?.start
    const end = words[words.length - 1]?.end
    if (start != null) {
      segment.startTime = start
    }
    if (end != null) {
      segment.endTime = end
    }
  }

  return [segment]
}
