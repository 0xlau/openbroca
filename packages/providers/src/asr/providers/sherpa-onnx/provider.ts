import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import type {
  DownloadProgress,
  LocalASRProvider,
  LocalModelInfo,
  RecognitionInput,
  RecognitionOptions,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent,
  TranscriptionSegment,
} from '../../contracts.ts'

export interface SherpaOnnxConfig {
  modelDir: string
}

const MODEL_MANIFEST: Array<{
  id: string
  name: string
  sizeBytes: number
  downloadUrl: string
  subDir: string
}> = [
  {
    id: 'zipformer-en-small',
    name: 'Zipformer English (Small)',
    sizeBytes: 66_000_000,
    downloadUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile.tar.bz2',
    subDir: 'sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile',
  },
  {
    id: 'paraformer-zh',
    name: 'Paraformer Chinese',
    sizeBytes: 220_000_000,
    downloadUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2',
    subDir: 'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
  },
]

export class SherpaOnnxASRProvider implements LocalASRProvider, StreamingASRProvider {
  readonly id = 'sherpa-onnx'
  readonly displayName = 'Sherpa-ONNX (Local)'

  private modelDir: string | null = null

  constructor(config: SherpaOnnxConfig) {
    this.modelDir = config.modelDir
  }

  isConfigured(): boolean {
    return this.modelDir !== null && fs.existsSync(this.modelDir)
  }

  async recognize(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): Promise<RecognitionResult> {
    throwIfAborted(options?.signal)
    assertInputSupported(this.id, input)
    const audio = normalizeAudioInput(input.audio)
    const segments: TranscriptionSegment[] = []

    for await (const event of this.runTranscription(audio, options)) {
      if (event.type === 'final') {
        segments.push(event.segment)
      }
    }

    return {
      text: segments.map((segment) => segment.text).join(' ').trim(),
      segments,
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const modelDir = this.assertModelDir()
    return MODEL_MANIFEST.map((model) => ({
      id: model.id,
      name: model.name,
      sizeBytes: model.sizeBytes,
      isDownloaded: fs.existsSync(path.join(modelDir, model.subDir)),
      downloadUrl: model.downloadUrl,
    }))
  }

  async *downloadModel(modelId: string, signal?: AbortSignal): AsyncIterable<DownloadProgress> {
    const modelDir = this.assertModelDir()
    const entry = MODEL_MANIFEST.find((model) => model.id === modelId)
    if (!entry) {
      throw new TranscriptionError(this.id, `Unknown model: ${modelId}`)
    }

    const destinationDir = path.join(modelDir, entry.subDir)
    if (fs.existsSync(destinationDir)) return

    fs.mkdirSync(modelDir, { recursive: true })
    yield* downloadWithProgress(this.id, modelId, entry.downloadUrl, modelDir, signal)
  }

  async deleteModel(modelId: string): Promise<void> {
    const modelDir = this.assertModelDir()
    const entry = MODEL_MANIFEST.find((model) => model.id === modelId)
    if (!entry) {
      throw new TranscriptionError(this.id, `Unknown model: ${modelId}`)
    }

    const destinationDir = path.join(modelDir, entry.subDir)
    if (fs.existsSync(destinationDir)) {
      fs.rmSync(destinationDir, { recursive: true, force: true })
    }
  }

  async *transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    assertInputSupported(this.id, input)
    const audio = normalizeAudioInput(input.audio)

    yield* this.runTranscription(audio, options)
  }

  private async *runTranscription(
    audio: AsyncIterable<Uint8Array>,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    const { recognizer, stream } = await this.createOnlineRecognizer(options)
    const decodeReady = () => this.decodeAvailable(recognizer, stream)

    for await (const chunk of audio) {
      throwIfAborted(options?.signal)

      const samples = int16ToFloat32(chunk)
      stream.acceptWaveform({ sampleRate: 16000, samples })

      yield* decodeReady()
    }

    throwIfAborted(options?.signal)
    stream.inputFinished()
    yield* decodeReady()
  }

  private *decodeAvailable(
    recognizer: SherpaOnlineRecognizerLike,
    stream: SherpaOnlineStreamLike
  ): Generator<TranscriptionEvent> {
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream)
      const result = recognizer.getResult(stream)
      if (result.text) {
        const isFinal = recognizer.isEndpoint(stream) || Boolean(result.is_final) || Boolean(result.is_eof)
        const segment: TranscriptionSegment = { text: result.text, isFinal }
        const timing = extractTiming(result)
        if (timing.startTime != null) {
          segment.startTime = timing.startTime
        }
        if (timing.endTime != null) {
          segment.endTime = timing.endTime
        }
        yield {
          type: isFinal ? 'final' : 'interim',
          segment,
        }
        if (isFinal) {
          recognizer.reset(stream)
        }
      }
    }
  }

  private async createOnlineRecognizer(options?: RecognitionOptions) {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    const sherpa = await import('sherpa-onnx-node').catch(() => {
      throw new TranscriptionError(
        this.id,
        'sherpa-onnx-node native module is not available on this platform'
      )
    })

    const modelDir = this.assertModelDir()
    const downloadedModel = MODEL_MANIFEST.find((model) => fs.existsSync(path.join(modelDir, model.subDir)))
    if (!downloadedModel) {
      throw new TranscriptionError(this.id, 'No models downloaded. Call downloadModel() first.')
    }

    const modelPath = path.join(modelDir, downloadedModel.subDir)
    const recognizerConfig = buildRecognizerConfig(modelPath, downloadedModel.id, options?.language)
    const recognizer: SherpaOnlineRecognizerLike = new sherpa.OnlineRecognizer(recognizerConfig)
    const stream: SherpaOnlineStreamLike = recognizer.createStream()

    return { recognizer, stream }
  }

  private assertModelDir(): string {
    if (!this.modelDir) {
      throw new ConfigurationError(this.id, 'modelDir is not configured')
    }

    return this.modelDir
  }
}

function assertInputSupported(providerId: string, input: RecognitionInput): void {
  if (input.mimeType) {
    throw new TranscriptionError(
      providerId,
      'Recognition metadata is not supported by sherpa-onnx'
    )
  }

  const encoding = input.encoding
  const sampleRate = input.sampleRate
  const channels = input.channels

  if (encoding && encoding !== 'linear16') {
    throw new TranscriptionError(
      providerId,
      'Recognition metadata is not supported by sherpa-onnx'
    )
  }

  if (sampleRate !== undefined && sampleRate !== 16000) {
    throw new TranscriptionError(
      providerId,
      'Recognition metadata is not supported by sherpa-onnx'
    )
  }

  if (channels !== undefined && channels !== 1) {
    throw new TranscriptionError(
      providerId,
      'Recognition metadata is not supported by sherpa-onnx'
    )
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return

  const error = new Error('Recognition aborted')
  error.name = 'AbortError'
  throw error
}

function normalizeAudioInput(
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

type SherpaOnlineResult = {
  text: string
  tokens?: string[]
  timestamps?: number[]
  start_time?: number
  is_final?: boolean
  is_eof?: boolean
}

type SherpaOnlineStreamLike = {
  acceptWaveform: (data: { sampleRate: number; samples: Float32Array }) => void
  inputFinished: () => void
}

type SherpaOnlineRecognizerLike = {
  createStream: () => SherpaOnlineStreamLike
  isReady: (stream: SherpaOnlineStreamLike) => boolean
  decode: (stream: SherpaOnlineStreamLike) => void
  getResult: (stream: SherpaOnlineStreamLike) => SherpaOnlineResult
  isEndpoint: (stream: SherpaOnlineStreamLike) => boolean
  reset: (stream: SherpaOnlineStreamLike) => void
}

function extractTiming(result: SherpaOnlineResult): { startTime?: number; endTime?: number } {
  const timestamps = Array.isArray(result.timestamps) ? result.timestamps : []
  const hasTimestamps = timestamps.length > 0
  const startTime =
    typeof result.start_time === 'number'
      ? result.start_time
      : hasTimestamps
        ? timestamps[0]
        : undefined
  const endTime = hasTimestamps ? timestamps[timestamps.length - 1] : undefined

  return { startTime, endTime }
}

function int16ToFloat32(buffer: Uint8Array): Float32Array {
  const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2)
  const float32 = new Float32Array(int16.length)
  for (let index = 0; index < int16.length; index++) {
    float32[index] = int16[index] / 32768.0
  }
  return float32
}

function buildRecognizerConfig(
  modelPath: string,
  modelId: string,
  _language?: string
): Record<string, unknown> {
  const base = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    enableEndpoint: 1,
    endpointConfig: {
      rule1: { minTrailingSilence: 2.4 },
      rule2: { minTrailingSilence: 1.2 },
      rule3: { minUtteranceLength: 20 },
    },
  }

  if (modelId === 'paraformer-zh') {
    return {
      ...base,
      modelConfig: {
        paraformer: {
          encoder: path.join(modelPath, 'encoder.int8.onnx'),
          decoder: path.join(modelPath, 'decoder.int8.onnx'),
        },
        tokens: path.join(modelPath, 'tokens.txt'),
        numThreads: 1,
        debug: 0,
      },
    }
  }

  return {
    ...base,
    modelConfig: {
      transducer: {
        encoder: path.join(modelPath, 'encoder-epoch-99-avg-1.onnx'),
        decoder: path.join(modelPath, 'decoder-epoch-99-avg-1.onnx'),
        joiner: path.join(modelPath, 'joiner-epoch-99-avg-1.onnx'),
      },
      tokens: path.join(modelPath, 'tokens.txt'),
      numThreads: 1,
      debug: 0,
    },
  }
}

class RedirectSignal {
  readonly url: string

  constructor(url: string) {
    this.url = url
  }
}

async function* downloadWithProgress(
  providerId: string,
  modelId: string,
  url: string,
  destinationDir: string,
  signal?: AbortSignal,
  maxRedirects = 5
): AsyncIterable<DownloadProgress> {
  if (maxRedirects < 0) {
    throw new TranscriptionError(providerId, 'Too many redirects')
  }

  const tempPath = path.join(destinationDir, `${modelId}.tmp.tar.bz2`)
  const queue: Array<DownloadProgress | Error | RedirectSignal | null> = []
  let notify: (() => void) | null = null

  const push = (item: DownloadProgress | Error | RedirectSignal | null) => {
    queue.push(item)
    notify?.()
  }

  let downloadedBytes = 0
  let totalBytes = 0
  const chunks: Buffer[] = []

  const request = https.get(url, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      const location = response.headers.location
      push(location ? null : new TranscriptionError(providerId, 'Redirect with no Location header'))
      if (location) {
        push(new RedirectSignal(location))
      }
      return
    }

    if (response.statusCode !== 200) {
      push(new TranscriptionError(providerId, `Download failed with HTTP ${response.statusCode ?? 'unknown'}`))
      return
    }

    totalBytes = parseInt(response.headers['content-length'] ?? '0', 10)

    signal?.addEventListener('abort', () => {
      request.destroy()
      push(new TranscriptionError(providerId, 'Download aborted'))
    })

    response.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length
      chunks.push(chunk)
      push({
        modelId,
        progress: totalBytes > 0 ? downloadedBytes / totalBytes : 0,
        downloadedBytes,
        totalBytes,
      })
    })

    response.on('end', () => {
      const data = Buffer.concat(chunks)
      fs.writeFileSync(tempPath, data)
      push(null)
    })

    response.on('error', (err) => {
      push(new TranscriptionError(providerId, err.message, err))
    })
  })

  request.on('error', (err) => {
    push(new TranscriptionError(providerId, err.message, err))
  })

  let redirectUrl: string | null = null
  while (true) {
    if (queue.length > 0) {
      const item = queue.shift()!
      if (item === null) break
      if (item instanceof RedirectSignal) {
        redirectUrl = item.url
        break
      }
      if (item instanceof Error) throw item
      yield item
    } else {
      await new Promise<void>((doneWaiting) => {
        notify = doneWaiting
      })
      notify = null
    }
  }

  if (redirectUrl) {
    yield* downloadWithProgress(providerId, modelId, redirectUrl, destinationDir, signal, maxRedirects - 1)
  }
}
