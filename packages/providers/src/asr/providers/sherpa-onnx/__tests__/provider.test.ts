import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError, TranscriptionError } from '../../../../shared/errors.ts'
import { SherpaOnnxASRProvider } from '../provider.ts'

import * as fs from 'node:fs'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

const onlineRecognizerMock = vi.fn()

vi.mock('sherpa-onnx-node', () => ({
  OnlineRecognizer: onlineRecognizerMock,
}))

const existsSyncMock = vi.mocked(fs.existsSync)

const makeProvider = (overrides?: { modelDir?: string }) =>
  new SherpaOnnxASRProvider({ modelDir: overrides?.modelDir ?? '/models' })

const makeAudio = async function* () {
  yield new Uint8Array([1, 2, 3, 4])
}

const makeRecognizer = (
  results: Array<{
    text: string
    endpoint?: boolean
    start_time?: number
    timestamps?: number[]
    is_final?: boolean
    is_eof?: boolean
  }>
) => {
  const stream = {
    acceptWaveform: vi.fn(),
    inputFinished: vi.fn(),
  }

  let index = 0
  let lastResult: (typeof results)[number] | null = null
  const recognizer = {
    createStream: vi.fn(() => stream),
    isReady: vi.fn(() => index < results.length),
    decode: vi.fn(),
    getResult: vi.fn(() => {
      const current = results[index++]
      lastResult = current ?? null
      const { endpoint, ...payload } = current ?? { text: '' }
      return payload
    }),
    isEndpoint: vi.fn(() => Boolean(lastResult?.endpoint)),
    reset: vi.fn(),
  }

  return { recognizer, stream }
}

describe('SherpaOnnxASRProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockImplementation((target) => {
      if (typeof target === 'string' && target.includes('/missing')) {
        return false
      }
      return true
    })
  })

  it('accepts normalized PCM metadata for recognize()', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([])

    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    await expect(
      provider.recognize({
        audio: new Uint8Array([1]),
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
      })
    ).resolves.toEqual({ text: '', segments: [] })
  })

  it('rejects unsupported recognition metadata for recognize()', async () => {
    const provider = makeProvider()

    await expect(
      provider.recognize({
        audio: new Uint8Array([1]),
        encoding: 'wav',
        sampleRate: 44100,
        channels: 2,
      })
    ).rejects.toThrow(TranscriptionError)
  })

  it('aborts recognize() instead of returning partial results', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([{ text: 'partial', endpoint: true }])
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      provider.recognize({ audio: new Uint8Array([1]) }, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('returns a final RecognitionResult from recognize()', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([
      { text: 'hello', endpoint: true },
      { text: 'world', endpoint: true },
    ])

    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const result = await provider.recognize({ audio: new Uint8Array([1, 2]) })

    expect(result.text).toBe('hello world')
    expect(result.segments).toEqual([
      { text: 'hello', isFinal: true },
      { text: 'world', isFinal: true },
    ])
  })

  it('drains recognition after inputFinished to capture trailing results', async () => {
    const provider = makeProvider()
    let finished = false
    let readyCount = 0
    const stream = {
      acceptWaveform: vi.fn(),
      inputFinished: vi.fn(() => {
        finished = true
      }),
    }
    const recognizer = {
      createStream: vi.fn(() => stream),
      isReady: vi.fn(() => finished && readyCount++ === 0),
      decode: vi.fn(),
      getResult: vi.fn(() => ({ text: 'post eof' })),
      isEndpoint: vi.fn(() => true),
      reset: vi.fn(),
    }

    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const iterator = provider.transcribe({ audio: makeAudio() })[Symbol.asyncIterator]()
    const final = await iterator.next()

    expect(final.value).toEqual({
      type: 'final',
      segment: { text: 'post eof', isFinal: true },
    })

    const done = await iterator.next()
    expect(done.done).toBe(true)
    expect(stream.inputFinished).toHaveBeenCalledOnce()
  })

  it('maps available timing data into segments', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([
      { text: 'timed', endpoint: true, start_time: 1.2, timestamps: [1.2, 1.7] },
    ])

    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const result = await provider.recognize({ audio: new Uint8Array([9, 9]) })

    expect(result.segments).toEqual([
      { text: 'timed', isFinal: true, startTime: 1.2, endTime: 1.7 },
    ])
  })

  it('emits interim and final transcription events', async () => {
    const provider = makeProvider()
    const { recognizer, stream } = makeRecognizer([
      { text: 'hello', endpoint: false },
      { text: 'hello world', endpoint: true },
    ])

    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const iterator = provider.transcribe({ audio: makeAudio() })[Symbol.asyncIterator]()
    const interim = await iterator.next()

    expect(interim.value).toEqual({
      type: 'interim',
      segment: { text: 'hello', isFinal: false },
    })

    const final = await iterator.next()

    expect(final.value).toEqual({
      type: 'final',
      segment: { text: 'hello world', isFinal: true },
    })

    const done = await iterator.next()
    expect(done.done).toBe(true)
    expect(stream.inputFinished).toHaveBeenCalledOnce()
  })

  it('throws TranscriptionError when no downloaded model is found', async () => {
    const provider = makeProvider()
    existsSyncMock.mockImplementation((target) => {
      if (typeof target === 'string' && target.includes('sherpa-onnx-streaming')) {
        return false
      }
      return true
    })

    await expect(provider.recognize({ audio: new Uint8Array([1]) }))
      .rejects
      .toThrow(/No models downloaded/)
  })

  it('throws ConfigurationError when not configured', async () => {
    const provider = makeProvider({ modelDir: '/missing' })

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

  it('throws TranscriptionError when sherpa-onnx-node is unavailable', async () => {
    vi.resetModules()
    vi.doMock('sherpa-onnx-node', () => {
      throw new Error('missing')
    })

    const { SherpaOnnxASRProvider: ReloadedProvider } = await import('../provider.ts')
    const provider = new ReloadedProvider({ modelDir: '/models' })

    await expect(provider.recognize({ audio: new Uint8Array([1]) }))
      .rejects
      .toThrow(/sherpa-onnx-node native module is not available/)

    vi.doMock('sherpa-onnx-node', () => ({ OnlineRecognizer: onlineRecognizerMock }))
    vi.resetModules()
  })
})
