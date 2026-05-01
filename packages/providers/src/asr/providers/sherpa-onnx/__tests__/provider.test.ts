import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError, TranscriptionError } from '../../../../shared/errors.ts'
import { SherpaOnnxASRProvider } from '../provider.ts'

import * as fs from 'node:fs'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    renameSync: vi.fn()
  }
})

const onlineRecognizerMock = vi.fn()

vi.mock('sherpa-onnx-node', () => ({
  OnlineRecognizer: onlineRecognizerMock
}))

const existsSyncMock = vi.mocked(fs.existsSync)

const makeProvider = (overrides?: { modelDir?: string }) =>
  new SherpaOnnxASRProvider({ modelDir: overrides?.modelDir ?? '/models' })

const makeAudio = async function* () {
  yield new Uint8Array([1, 2, 3, 4])
}

const PARAFORMER_ID = 'paraformer-zh'
const ZIPFORMER_ID = 'zipformer-en-small'

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
    inputFinished: vi.fn()
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
    reset: vi.fn()
  }

  return { recognizer, stream }
}

describe('SherpaOnnxASRProvider — local lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockImplementation((target) => {
      // Default: model dir + a paraformer install exist; everything else missing.
      const s = String(target)
      if (s === '/models') return true
      if (s.includes('sherpa-onnx-streaming-paraformer-bilingual-zh-en')) return true
      return false
    })
  })

  it('listCatalogModels exposes catalog entries with recommendedFor (and optional sha256)', async () => {
    const provider = makeProvider()
    const catalog = await provider.listCatalogModels()
    const ids = catalog.map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining([ZIPFORMER_ID, PARAFORMER_ID]))
    const paraformer = catalog.find((m) => m.id === PARAFORMER_ID)!
    expect(paraformer.sizeBytes).toBeGreaterThan(0)
    expect(paraformer.recommendedFor).toEqual(['zh', 'zh-CN', 'en'])
    // The Chinese-English bilingual paraformer ships without sha256 (the
    // upstream release doesn't publish hashes); install relies on size
    // verification instead.
    expect(paraformer.sha256).toBeUndefined()
    // The Chinese 14M zipformer does have a sha256 (we fetched it once),
    // verifying the optional field round-trips through listCatalogModels.
    const zh14M = catalog.find((m) => m.id === 'zipformer-zh-small')!
    expect(zh14M.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('scanInstalledModels filters the catalog by required-files presence', async () => {
    const provider = makeProvider()
    const installed = await provider.scanInstalledModels()
    expect(installed.map((m) => m.id)).toEqual([PARAFORMER_ID])
  })

  it('resolveModelRuntime returns the path for an installed model', async () => {
    const provider = makeProvider()
    const runtime = await provider.resolveModelRuntime(PARAFORMER_ID)
    expect(runtime).toEqual({
      modelId: PARAFORMER_ID,
      modelPath: expect.stringContaining('sherpa-onnx-streaming-paraformer-bilingual-zh-en')
    })
  })

  it('resolveModelRuntime throws ConfigurationError for an uninstalled model', async () => {
    const provider = makeProvider()
    await expect(provider.resolveModelRuntime(ZIPFORMER_ID)).rejects.toBeInstanceOf(
      ConfigurationError
    )
  })

  it('resolveModelRuntime throws TranscriptionError for an unknown model id', async () => {
    const provider = makeProvider()
    await expect(provider.resolveModelRuntime('not-a-real-model')).rejects.toBeInstanceOf(
      TranscriptionError
    )
  })

  it('removeInstalledModel removes the directory when present', async () => {
    const rmSyncMock = vi.mocked(fs.rmSync)
    const provider = makeProvider()
    await provider.removeInstalledModel(PARAFORMER_ID)
    expect(rmSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('sherpa-onnx-streaming-paraformer-bilingual-zh-en'),
      expect.objectContaining({ recursive: true, force: true })
    )
  })

  it('removeInstalledModel is a no-op when the directory is absent', async () => {
    existsSyncMock.mockReturnValue(false)
    const rmSyncMock = vi.mocked(fs.rmSync)
    const provider = makeProvider()
    await provider.removeInstalledModel(PARAFORMER_ID)
    expect(rmSyncMock).not.toHaveBeenCalled()
  })
})

describe('SherpaOnnxASRProvider — recognition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockImplementation((target) => {
      const s = String(target)
      if (s === '/models') return true
      if (s.includes('sherpa-onnx-streaming-paraformer-bilingual-zh-en')) return true
      return false
    })
  })

  it('recognize requires options.modelId', async () => {
    const provider = makeProvider()
    await expect(provider.recognize({ audio: new Uint8Array([1]) })).rejects.toBeInstanceOf(
      ConfigurationError
    )
  })

  it('recognize accepts normalized PCM metadata when modelId is provided', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([])
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    await expect(
      provider.recognize(
        {
          audio: new Uint8Array([1]),
          encoding: 'linear16',
          sampleRate: 16000,
          channels: 1
        },
        { modelId: PARAFORMER_ID }
      )
    ).resolves.toEqual({ text: '', segments: [] })
  })

  it('recognize rejects unsupported PCM metadata', async () => {
    const provider = makeProvider()
    await expect(
      provider.recognize(
        {
          audio: new Uint8Array([1]),
          encoding: 'wav',
          sampleRate: 44100,
          channels: 2
        },
        { modelId: PARAFORMER_ID }
      )
    ).rejects.toBeInstanceOf(TranscriptionError)
  })

  it('aborts recognize() before returning any result', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([{ text: 'partial', endpoint: true }])
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      provider.recognize(
        { audio: new Uint8Array([1]) },
        { signal: controller.signal, modelId: PARAFORMER_ID }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('returns a final RecognitionResult from recognize()', async () => {
    const provider = makeProvider()
    const { recognizer } = makeRecognizer([
      { text: 'hello', endpoint: true },
      { text: 'world', endpoint: true }
    ])
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const result = await provider.recognize(
      { audio: new Uint8Array([1, 2]) },
      { modelId: PARAFORMER_ID }
    )

    expect(result.text).toBe('hello world')
    expect(result.segments).toEqual([
      { text: 'hello', isFinal: true },
      { text: 'world', isFinal: true }
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
      })
    }
    const recognizer = {
      createStream: vi.fn(() => stream),
      isReady: vi.fn(() => finished && readyCount++ === 0),
      decode: vi.fn(),
      getResult: vi.fn(() => ({ text: 'post eof' })),
      isEndpoint: vi.fn(() => true),
      reset: vi.fn()
    }
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const iterator = provider
      .transcribe({ audio: makeAudio() }, { modelId: PARAFORMER_ID })
      [Symbol.asyncIterator]()
    const final = await iterator.next()
    expect(final.value).toEqual({
      type: 'final',
      segment: { text: 'post eof', isFinal: true }
    })

    const done = await iterator.next()
    expect(done.done).toBe(true)
    expect(stream.inputFinished).toHaveBeenCalledOnce()
  })

  it('synthesizes a final segment when streaming recognition has no endpoint at EOS', async () => {
    // Simulates the real recording case: the streaming recognizer never reports
    // an endpoint, so all events from decodeAvailable would be interim. After
    // inputFinished the recognizer accumulated text — the provider must commit
    // it as a final segment or recognize() returns an empty transcript.
    const provider = makeProvider()
    const stream = {
      acceptWaveform: vi.fn(),
      inputFinished: vi.fn()
    }
    let readyCount = 0
    let accumulated = ''
    const recognizer = {
      createStream: vi.fn(() => stream),
      isReady: vi.fn(() => readyCount++ < 3),
      decode: vi.fn(() => {
        // Each decode appends one word to the running hypothesis.
        accumulated += 'hello '
      }),
      getResult: vi.fn(() => ({ text: accumulated.trim() })),
      isEndpoint: vi.fn(() => false), // never an endpoint — the bug case
      reset: vi.fn()
    }
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const result = await provider.recognize(
      { audio: new Uint8Array([1, 2, 3, 4]) },
      { modelId: PARAFORMER_ID }
    )

    expect(result.text).toBe('hello hello hello')
    expect(result.segments).toEqual([
      expect.objectContaining({ text: 'hello hello hello', isFinal: true })
    ])
    expect(stream.inputFinished).toHaveBeenCalledOnce()
  })

  it('emits interim and final transcription events', async () => {
    const provider = makeProvider()
    const { recognizer, stream } = makeRecognizer([
      { text: 'hello', endpoint: false },
      { text: 'hello world', endpoint: true }
    ])
    onlineRecognizerMock.mockImplementation(function () {
      return recognizer
    })

    const iterator = provider
      .transcribe({ audio: makeAudio() }, { modelId: PARAFORMER_ID })
      [Symbol.asyncIterator]()
    const interim = await iterator.next()
    expect(interim.value).toEqual({
      type: 'interim',
      segment: { text: 'hello', isFinal: false }
    })
    const final = await iterator.next()
    expect(final.value).toEqual({
      type: 'final',
      segment: { text: 'hello world', isFinal: true }
    })
    const done = await iterator.next()
    expect(done.done).toBe(true)
    expect(stream.inputFinished).toHaveBeenCalledOnce()
  })

  it('throws ConfigurationError when the selected model is not installed', async () => {
    const provider = makeProvider()
    await expect(
      provider.recognize({ audio: new Uint8Array([1]) }, { modelId: ZIPFORMER_ID })
    ).rejects.toBeInstanceOf(ConfigurationError)
  })

  it('throws TranscriptionError when sherpa-onnx-node is unavailable', async () => {
    vi.resetModules()
    vi.doMock('sherpa-onnx-node', () => {
      throw new Error('missing')
    })

    const { SherpaOnnxASRProvider: ReloadedProvider } = await import('../provider.ts')
    const provider = new ReloadedProvider({ modelDir: '/models' })

    await expect(
      provider.recognize({ audio: new Uint8Array([1]) }, { modelId: PARAFORMER_ID })
    ).rejects.toThrow(/sherpa-onnx-node failed to load/)

    vi.doMock('sherpa-onnx-node', () => ({ OnlineRecognizer: onlineRecognizerMock }))
    vi.resetModules()
  })
})

describe('SherpaOnnxASRProvider — config-supplied models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(false)
  })

  it('uses caller-supplied models when provided, replacing the default catalog', async () => {
    const customModel = {
      id: 'custom-zh',
      name: 'Custom Chinese',
      sizeBytes: 12_345,
      downloadUrl: 'https://example.com/custom.tar.bz2',
      sha256: 'CUSTOM_SHA',
      subDir: 'custom-zh',
      architecture: 'streaming-paraformer',
      recommendedFor: ['zh']
    }
    const provider = new SherpaOnnxASRProvider({
      modelDir: '/models',
      models: [customModel]
    })

    const catalog = await provider.listCatalogModels()
    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'custom-zh',
        name: 'Custom Chinese',
        sha256: 'CUSTOM_SHA'
      })
    ])

    await expect(provider.resolveModelRuntime(ZIPFORMER_ID)).rejects.toThrow(
      /Unknown model: zipformer-en-small/
    )
  })
})
