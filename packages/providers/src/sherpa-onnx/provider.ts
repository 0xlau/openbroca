import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import { ConfigurationError, TranscriptionError } from '@openbroca/core'
import type {
  DownloadProgress,
  LocalASRProvider,
  LocalModelInfo,
  TranscriptionOptions,
  TranscriptionSegment,
} from '@openbroca/core/asr'

export interface SherpaOnnxConfig {
  /** Directory where model files are stored */
  modelDir: string
}

/**
 * Well-known sherpa-onnx models available for download.
 * Each entry maps to a self-contained model directory on the sherpa-onnx GitHub releases.
 */
const MODEL_MANIFEST: Array<{
  id: string
  name: string
  sizeBytes: number
  downloadUrl: string
  /** Subdirectory inside modelDir where this model will be extracted */
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

export class SherpaOnnxASRProvider implements LocalASRProvider {
  readonly id = 'sherpa-onnx'
  readonly displayName = 'Sherpa-ONNX (Local)'

  private modelDir: string | null = null

  constructor(config: SherpaOnnxConfig) {
    this.modelDir = config.modelDir
  }

  isConfigured(): boolean {
    return this.modelDir !== null && fs.existsSync(this.modelDir)
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const modelDir = this.assertModelDir()
    return MODEL_MANIFEST.map((m) => ({
      id: m.id,
      name: m.name,
      sizeBytes: m.sizeBytes,
      isDownloaded: fs.existsSync(path.join(modelDir, m.subDir)),
      downloadUrl: m.downloadUrl,
    }))
  }

  async *downloadModel(modelId: string, signal?: AbortSignal): AsyncIterable<DownloadProgress> {
    const modelDir = this.assertModelDir()
    const entry = MODEL_MANIFEST.find((m) => m.id === modelId)
    if (!entry) {
      throw new TranscriptionError(this.id, `Unknown model: ${modelId}`)
    }

    const destDir = path.join(modelDir, entry.subDir)
    if (fs.existsSync(destDir)) return

    // Ensure model directory exists
    fs.mkdirSync(modelDir, { recursive: true })

    yield* downloadWithProgress(this.id, modelId, entry.downloadUrl, modelDir, signal)
  }

  async deleteModel(modelId: string): Promise<void> {
    const modelDir = this.assertModelDir()
    const entry = MODEL_MANIFEST.find((m) => m.id === modelId)
    if (!entry) {
      throw new TranscriptionError(this.id, `Unknown model: ${modelId}`)
    }
    const destDir = path.join(modelDir, entry.subDir)
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true })
    }
  }

  async *transcribe(
    audio: AsyncIterable<Uint8Array>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptionSegment> {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    // Lazily import the native module — it may not be available on all platforms
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sherpa = await import('sherpa-onnx-node').catch(() => {
      throw new TranscriptionError(
        this.id,
        'sherpa-onnx-node native module is not available on this platform'
      )
    })

    const modelDir = this.assertModelDir()

    // Find a downloaded model to use — prefer zipformer for English, paraformer for Chinese
    const downloaded = MODEL_MANIFEST.find((m) => fs.existsSync(path.join(modelDir, m.subDir)))
    if (!downloaded) {
      throw new TranscriptionError(this.id, 'No models downloaded. Call downloadModel() first.')
    }

    const modelPath = path.join(modelDir, downloaded.subDir)

    // Configure the online (streaming) recognizer
    const recognizerConfig = buildRecognizerConfig(modelPath, downloaded.id, options?.language)
    const recognizer: SherpaOnlineRecognizer = new sherpa.OnlineRecognizer(recognizerConfig)
    const stream: SherpaOnlineStream = recognizer.createStream()

    try {
      for await (const chunk of audio) {
        if (options?.signal?.aborted) break

        // sherpa-onnx expects Float32Array samples at 16kHz
        const samples = int16ToFloat32(chunk)
        stream.acceptWaveform({ sampleRate: 16000, samples })

        while (recognizer.isReady(stream)) {
          recognizer.decode(stream)
          const result: { text: string; isEndpoint: boolean } = recognizer.getResult(stream)
          if (result.text) {
            const isFinal = result.isEndpoint
            yield { text: result.text, isFinal }
            if (isFinal) {
              recognizer.reset(stream)
            }
          }
        }
      }
    } finally {
      stream.free()
    }
  }

  private assertModelDir(): string {
    if (!this.modelDir) {
      throw new ConfigurationError(this.id, 'modelDir is not configured')
    }
    return this.modelDir
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function int16ToFloat32(buffer: Uint8Array): Float32Array {
  const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0
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

  // Default: zipformer transducer
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
  constructor(public readonly url: string) {}
}

async function* downloadWithProgress(
  providerId: string,
  modelId: string,
  url: string,
  destDir: string,
  signal?: AbortSignal,
  maxRedirects = 5
): AsyncIterable<DownloadProgress> {
  if (maxRedirects < 0) {
    throw new TranscriptionError(providerId, 'Too many redirects')
  }

  const tmpPath = path.join(destDir, `${modelId}.tmp.tar.bz2`)

  // Channel: callbacks pushed by https events, consumed by the generator
  const queue: Array<DownloadProgress | Error | RedirectSignal | null> = []
  let notify: (() => void) | null = null

  const push = (item: DownloadProgress | Error | RedirectSignal | null) => {
    queue.push(item)
    notify?.()
  }

  let downloadedBytes = 0
  let totalBytes = 0
  const chunks: Buffer[] = []

  const request = https.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      const location = res.headers.location
      push(location ? null : new TranscriptionError(providerId, 'Redirect with no Location header'))
      if (location) {
        // Signal redirect via a sentinel — handled below after loop
        push(new RedirectSignal(location))
      }
      return
    }

    if (res.statusCode !== 200) {
      push(new TranscriptionError(providerId, `Download failed with HTTP ${res.statusCode ?? 'unknown'}`))
      return
    }

    totalBytes = parseInt(res.headers['content-length'] ?? '0', 10)

    signal?.addEventListener('abort', () => {
      request.destroy()
      push(new TranscriptionError(providerId, 'Download aborted'))
    })

    res.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length
      chunks.push(chunk)
      push({
        modelId,
        progress: totalBytes > 0 ? downloadedBytes / totalBytes : 0,
        downloadedBytes,
        totalBytes,
      })
    })

    res.on('end', () => {
      const data = Buffer.concat(chunks)
      fs.writeFileSync(tmpPath, data)
      push(null) // null = done
    })

    res.on('error', (err) => {
      push(new TranscriptionError(providerId, err.message, err))
    })
  })

  request.on('error', (err) => {
    push(new TranscriptionError(providerId, err.message, err))
  })

  // Drain the channel
  let redirectUrl: string | null = null
  while (true) {
    if (queue.length > 0) {
      const item = queue.shift()!
      if (item === null) break
      if (item instanceof RedirectSignal) { redirectUrl = item.url; break }
      if (item instanceof Error) throw item
      yield item
    } else {
      await new Promise<void>((r) => { notify = r })
      notify = null
    }
  }

  if (redirectUrl) {
    yield* downloadWithProgress(providerId, modelId, redirectUrl, destDir, signal, maxRedirects - 1)
  }
}

