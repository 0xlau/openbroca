import { ConfigurationError, TranscriptionError } from '@openbroca/core'
import type {
  ASRProvider,
  TranscriptionOptions,
  TranscriptionSegment,
} from '@openbroca/core/asr'
import { createClient } from '@deepgram/sdk'

export interface DeepgramConfig {
  apiKey: string
}

export class DeepgramASRProvider implements ASRProvider {
  readonly id = 'deepgram'
  readonly displayName = 'Deepgram'

  private apiKey: string

  constructor(config: DeepgramConfig) {
    this.apiKey = config.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  async *transcribe(
    audio: AsyncIterable<Uint8Array>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptionSegment> {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    const client = createClient(this.apiKey)

    // Bridge Deepgram's event-based output to an AsyncIterable using a shared queue
    const segments: TranscriptionSegment[] = []
    let done = false
    let error: Error | null = null
    let resolve: (() => void) | null = null

    const notify = () => {
      if (resolve) {
        const r = resolve
        resolve = null
        r()
      }
    }

    const connection = client.listen.live({
      model: 'nova-2',
      language: options?.language ?? 'en',
      smart_format: true,
      encoding: 'linear16',
      sample_rate: 16000,
      interim_results: true,
    })

    connection.on('open', () => {
      // Connection ready, audio will be sent in the loop below
    })

    connection.on('Results', (data: {
      channel: { alternatives: Array<{ transcript: string }> }
      is_final: boolean
      start?: number
      duration?: number
    }) => {
      const transcript = data.channel.alternatives[0]?.transcript ?? ''
      if (!transcript) return
      segments.push({
        text: transcript,
        isFinal: data.is_final,
        startTime: data.start,
        endTime: data.start != null && data.duration != null ? data.start + data.duration : undefined,
      })
      notify()
    })

    connection.on('error', (err: Error) => {
      error = new TranscriptionError(this.id, err.message, err)
      done = true
      notify()
    })

    connection.on('close', () => {
      done = true
      notify()
    })

    // Send audio chunks to Deepgram in the background
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

    // Yield segments as they arrive
    while (!done || segments.length > 0) {
      if (segments.length > 0) {
        yield segments.shift()!
        continue
      }
      if (error) throw error
      // Wait for the next event
      await new Promise<void>((r) => {
        resolve = r
      })
    }

    if (error) throw error
  }
}
