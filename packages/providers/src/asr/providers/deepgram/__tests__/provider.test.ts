import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@deepgram/sdk'
import { ConfigurationError, TranscriptionError } from '../../../../shared/errors.ts'
import { DeepgramASRProvider } from '../provider.ts'

vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn(),
}))

const createClientMock = vi.mocked(createClient)

class MockLiveConnection {
  private emitter = new EventEmitter()
  readonly send = vi.fn()
  readonly requestClose = vi.fn()

  on(event: string, handler: (...args: unknown[]) => void) {
    this.emitter.on(event, handler)
    return this
  }

  emitResults(payload: unknown) {
    this.emitter.emit('Results', payload)
  }

  emitClose() {
    this.emitter.emit('close')
  }
}

const makeProvider = (overrides?: {
  prerecordedResult?: unknown
  liveConnection?: MockLiveConnection
}) => {
  const prerecordedResult = overrides?.prerecordedResult ?? { result: null, error: null }
  const liveConnection = overrides?.liveConnection ?? new MockLiveConnection()
  const transcribeFile = vi.fn().mockResolvedValue(prerecordedResult)

  createClientMock.mockReturnValue({
    listen: {
      prerecorded: {
        transcribeFile,
      },
      live: vi.fn(() => liveConnection),
    },
  } as unknown as ReturnType<typeof createClient>)

  return { provider: new DeepgramASRProvider({ apiKey: 'dg-test' }), liveConnection, transcribeFile }
}

const makeAudio = async function* () {
  yield new Uint8Array([1, 2, 3])
}

describe('DeepgramASRProvider', () => {
  beforeEach(() => {
    createClientMock.mockReset()
  })

  it('maps prerecorded utterances into RecognitionResult segments', async () => {
    const { provider, transcribeFile } = makeProvider({
      prerecordedResult: {
        result: {
          metadata: { duration: 1.2 },
          results: {
            utterances: [
              { transcript: 'hello', start: 0.1, end: 0.6 },
              { transcript: 'world', start: 0.7, end: 1.1 },
            ],
          },
        },
        error: null,
      },
    })

    const result = await provider.recognize({ audio: new Uint8Array([7, 8]) }, { language: 'es' })

    expect(result.text).toBe('hello world')
    expect(result.segments).toEqual([
      { text: 'hello', isFinal: true, startTime: 0.1, endTime: 0.6 },
      { text: 'world', isFinal: true, startTime: 0.7, endTime: 1.1 },
    ])
    expect(transcribeFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        model: 'nova-2',
        language: 'es',
        smart_format: true,
        utterances: true,
      })
    )
  })

  it('falls back to the top alternative when utterances are missing', async () => {
    const { provider } = makeProvider({
      prerecordedResult: {
        result: {
          metadata: { duration: 1.2 },
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: 'fallback transcript',
                    words: [
                      { start: 0.2, end: 0.8, word: 'fallback', confidence: 0.9 },
                      { start: 0.8, end: 1.1, word: 'transcript', confidence: 0.9 },
                    ],
                  },
                ],
              },
            ],
          },
        },
        error: null,
      },
    })

    const result = await provider.recognize({ audio: new Uint8Array([9]) })

    expect(result.text).toBe('fallback transcript')
    expect(result.segments).toEqual([
      { text: 'fallback transcript', isFinal: true, startTime: 0.2, endTime: 1.1 },
    ])
  })

  it('accepts normalized PCM metadata for prerecorded recognition', async () => {
    const { provider, transcribeFile } = makeProvider({
      prerecordedResult: {
        result: {
          metadata: { duration: 0.4 },
          results: { channels: [] },
        },
        error: null,
      },
    })

    await expect(
      provider.recognize({
        audio: new Uint8Array([1]),
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
      })
    ).resolves.toEqual({ text: '', segments: [] })

    expect(transcribeFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        utterances: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      }
    )
  })

  it('rejects prerecorded metadata that conflicts with normalized PCM', async () => {
    const { provider } = makeProvider({
      prerecordedResult: {
        result: {
          metadata: { duration: 0.4 },
          results: { channels: [] },
        },
        error: null,
      },
    })

    await expect(
      provider.recognize({
        audio: new Uint8Array([1]),
        encoding: 'mp3',
        sampleRate: 44100,
        channels: 2,
      })
    ).rejects.toThrow(TranscriptionError)
  })

  it('aborts recognize() before submitting a truncated prerecorded request', async () => {
    const { provider, transcribeFile } = makeProvider({
      prerecordedResult: {
        result: { metadata: { duration: 0.4 }, results: { channels: [] } },
        error: null,
      },
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      provider.recognize({ audio: new Uint8Array([1, 2, 3]) }, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(transcribeFile).not.toHaveBeenCalled()
  })

  it('wraps Deepgram errors for prerecorded recognition', async () => {
    const { provider } = makeProvider({
      prerecordedResult: {
        result: null,
        error: { message: 'Deepgram down' },
      },
    })

    await expect(provider.recognize({ audio: new Uint8Array([2]) }))
      .rejects
      .toThrow(/Deepgram down/)
  })

  it('omits timing fields when utterances have no timing', async () => {
    const { provider } = makeProvider({
      prerecordedResult: {
        result: {
          metadata: { duration: 1.2 },
          results: {
            utterances: [
              { transcript: 'no timing' },
            ],
          },
        },
        error: null,
      },
    })

    const result = await provider.recognize({ audio: new Uint8Array([4]) })

    expect(result.segments[0]).toEqual({ text: 'no timing', isFinal: true })
    expect(result.segments[0]).not.toHaveProperty('startTime')
    expect(result.segments[0]).not.toHaveProperty('endTime')
  })

  it('omits timing fields when fallback words are missing', async () => {
    const { provider } = makeProvider({
      prerecordedResult: {
        result: {
          metadata: { duration: 1.2 },
          results: {
            channels: [
              {
                alternatives: [
                  { transcript: 'no words' },
                ],
              },
            ],
          },
        },
        error: null,
      },
    })

    const result = await provider.recognize({ audio: new Uint8Array([5]) })

    expect(result.segments[0]).toEqual({ text: 'no words', isFinal: true })
    expect(result.segments[0]).not.toHaveProperty('startTime')
    expect(result.segments[0]).not.toHaveProperty('endTime')
  })

  it('emits interim and final transcription events', async () => {
    const liveConnection = new MockLiveConnection()
    const { provider } = makeProvider({ liveConnection })

    const iterator = provider.transcribe({ audio: makeAudio() })[Symbol.asyncIterator]()
    const interimPromise = iterator.next()

    liveConnection.emitResults({
      channel: { alternatives: [{ transcript: 'hello' }] },
      is_final: false,
      start: 0.3,
      duration: 0.4,
    })

    const interim = await interimPromise
    expect(interim.value).toEqual({
      type: 'interim',
      segment: { text: 'hello', isFinal: false, startTime: 0.3, endTime: 0.7 },
    })

    const finalPromise = iterator.next()

    liveConnection.emitResults({
      channel: { alternatives: [{ transcript: 'hello world' }] },
      is_final: true,
      start: 0.3,
      duration: 0.8,
    })

    const final = await finalPromise
    expect(final.value).toEqual({
      type: 'final',
      segment: { text: 'hello world', isFinal: true, startTime: 0.3, endTime: 1.1 },
    })

    liveConnection.emitClose()
    const done = await iterator.next()
    expect(done.done).toBe(true)
  })

  it('throws ConfigurationError when not configured', async () => {
    const provider = new DeepgramASRProvider({ apiKey: '' })

    await expect(provider.recognize({ audio: new Uint8Array([1]) }))
      .rejects
      .toThrow(ConfigurationError)

    const run = async () => {
      for await (const _ of provider.transcribe({ audio: makeAudio() })) {
        // empty
      }
    }

    await expect(run()).rejects.toThrow(ConfigurationError)
  })
})
