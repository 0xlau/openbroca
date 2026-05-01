import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import { AsyncPushQueue } from '../../../shared/async-queue.ts'
import { assertPCMInput, normalizeAudioChunks, throwIfAborted } from '../../../shared/audio.ts'
import type {
  InstalledLocalModel,
  LocalASRProvider,
  LocalCatalogModel,
  LocalModelInstallEvent,
  LocalModelRuntime,
  RecognitionInput,
  RecognitionOptions,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent,
  TranscriptionSegment
} from '../../contracts.ts'
import { findArchitecture, type SherpaArchitecture } from './architectures.ts'
import { DEFAULT_SHERPA_MODELS, type SherpaModelManifestEntry } from './manifest.ts'

export { DEFAULT_SHERPA_MODELS, type SherpaModelManifestEntry } from './manifest.ts'
export {
  ARCHITECTURES,
  STREAMING_PARAFORMER,
  STREAMING_TRANSDUCER,
  type SherpaArchitecture,
  type SherpaArchitectureFiles
} from './architectures.ts'

const PCM_INPUT_ERROR = 'Recognition metadata is not supported by sherpa-onnx'
const MAX_REDIRECTS = 5

export interface SherpaOnnxConfig {
  modelDir: string
  /** Override the built-in model catalog. When omitted, falls back to DEFAULT_SHERPA_MODELS. */
  models?: SherpaModelManifestEntry[]
  /**
   * Additional architectures registered alongside the built-in ones. Use this
   * to plug in support for an architecture that isn't shipped by default
   * (e.g. an internal fork). Architecture lookup falls back to the built-in
   * registry, so callers don't need to repeat existing architectures here.
   */
  architectures?: SherpaArchitecture[]
}

export class SherpaOnnxASRProvider implements LocalASRProvider, StreamingASRProvider {
  readonly id = 'sherpa-onnx'
  readonly displayName = 'Sherpa-ONNX (Local)'

  private readonly modelDir: string
  private readonly models: readonly SherpaModelManifestEntry[]
  private readonly extraArchitectures: ReadonlyArray<SherpaArchitecture>

  constructor(config: SherpaOnnxConfig) {
    this.modelDir = config.modelDir
    this.models = config.models ?? DEFAULT_SHERPA_MODELS
    this.extraArchitectures = config.architectures ?? []
  }

  isConfigured(): boolean {
    return true
  }

  // ---------- LocalASRProvider lifecycle ----------

  async listCatalogModels(): Promise<LocalCatalogModel[]> {
    return this.models.map(({ id, name, description, sizeBytes, downloadUrl, sha256, recommendedFor }) => ({
      id,
      name,
      description,
      sizeBytes,
      downloadUrl,
      sha256,
      recommendedFor
    }))
  }

  async scanInstalledModels(): Promise<InstalledLocalModel[]> {
    if (!fs.existsSync(this.modelDir)) {
      return []
    }
    return this.models
      .map((entry) => {
        const modelPath = path.join(this.modelDir, entry.subDir)
        const arch = this.lookupArchitecture(entry)
        return { entry, modelPath, arch }
      })
      .filter(({ arch, modelPath }) =>
        fs.existsSync(modelPath) && arch.describe(modelPath).files !== null
      )
      .map(({ entry, modelPath }) => ({
        id: entry.id,
        name: entry.name,
        path: modelPath,
        sizeBytes: entry.sizeBytes
      }))
  }

  async *installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent> {
    const entry = this.requireEntry(modelId)
    const arch = this.lookupArchitecture(entry)
    fs.mkdirSync(this.modelDir, { recursive: true })

    const archivePath = path.join(this.modelDir, `${modelId}.tar.bz2.tmp`)
    const stagingPath = path.join(this.modelDir, `${entry.subDir}.staging`)
    const finalPath = path.join(this.modelDir, entry.subDir)

    const cleanup = () => {
      fs.rmSync(archivePath, { force: true })
      fs.rmSync(stagingPath, { recursive: true, force: true })
    }

    try {
      yield* streamDownload(this.id, entry.downloadUrl, archivePath, signal)

      yield { phase: 'extracting' }
      verifyArchiveIntegrity(this.id, archivePath, entry)
      extractTarBz2ToStaging(this.id, archivePath, this.modelDir, entry.subDir, stagingPath)

      yield { phase: 'validating' }
      const description = arch.describe(stagingPath)
      if (description.files === null) {
        throw new TranscriptionError(
          this.id,
          `Installed model "${modelId}" is missing required files: ${description.missing.join(', ')}`
        )
      }

      yield { phase: 'finalizing' }
      fs.rmSync(finalPath, { recursive: true, force: true })
      fs.renameSync(stagingPath, finalPath)
      fs.rmSync(archivePath, { force: true })
    } catch (err) {
      cleanup()
      throw err
    }
  }

  async removeInstalledModel(modelId: string): Promise<void> {
    const entry = this.requireEntry(modelId)
    const target = path.join(this.modelDir, entry.subDir)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
    }
  }

  async resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime> {
    const entry = this.requireEntry(selectedModelId)
    const arch = this.lookupArchitecture(entry)
    const modelPath = path.join(this.modelDir, entry.subDir)
    if (!fs.existsSync(modelPath) || arch.describe(modelPath).files === null) {
      throw new ConfigurationError(this.id, `Selected model "${selectedModelId}" is not installed`)
    }
    return { modelId: selectedModelId, modelPath }
  }

  // ---------- Recognition ----------

  async recognize(input: RecognitionInput, options?: RecognitionOptions): Promise<RecognitionResult> {
    throwIfAborted(options?.signal)
    assertPCMInput(this.id, input, PCM_INPUT_ERROR)
    const audio = normalizeAudioChunks(input.audio)
    const segments: TranscriptionSegment[] = []

    for await (const event of this.runTranscription(audio, options)) {
      if (event.type === 'final') {
        segments.push(event.segment)
      }
    }

    return {
      text: segments.map((segment) => segment.text).join(' ').trim(),
      segments
    }
  }

  async *transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    assertPCMInput(this.id, input, PCM_INPUT_ERROR)
    const audio = normalizeAudioChunks(input.audio)
    yield* this.runTranscription(audio, options)
  }

  private async *runTranscription(
    audio: AsyncIterable<Uint8Array>,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    const { recognizer, stream } = await this.createOnlineRecognizer(options)

    // Track the most recent endpoint-driven final so we don't double-emit
    // when a synthetic end-of-stream final would just repeat it.
    let lastFinalText: string | null = null

    const drain = function* (
      this: SherpaOnnxASRProvider
    ): Generator<TranscriptionEvent> {
      for (const event of this.decodeAvailable(recognizer, stream)) {
        if (event.type === 'final') lastFinalText = event.segment.text
        yield event
      }
    }.bind(this)

    for await (const chunk of audio) {
      throwIfAborted(options?.signal)
      const samples = int16ToFloat32(chunk)
      stream.acceptWaveform({ sampleRate: 16000, samples })
      yield* drain()
    }

    throwIfAborted(options?.signal)

    // Streaming zipformer/paraformer only commit a hypothesis when an endpoint
    // is detected. Most pipeline inputs lack natural trailing silence, so we
    // append a short silence tail to flush the model state.
    const silenceTail = new Float32Array(8000) // 0.5s @ 16kHz
    stream.acceptWaveform({ sampleRate: 16000, samples: silenceTail })
    stream.inputFinished()
    yield* drain()

    // After draining, no more audio is coming. If the recognizer accumulated
    // text past the last endpoint-driven final, commit it as a synthetic
    // final — the streaming recognizer doesn't always trigger an endpoint
    // event at end-of-stream, but the caller still needs the result.
    const finalResult = recognizer.getResult(stream)
    if (finalResult.text && finalResult.text !== lastFinalText) {
      const segment: TranscriptionSegment = { text: finalResult.text, isFinal: true }
      const timing = extractTiming(finalResult)
      if (timing.startTime != null) segment.startTime = timing.startTime
      if (timing.endTime != null) segment.endTime = timing.endTime
      yield { type: 'final', segment }
    }
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
        if (timing.startTime != null) segment.startTime = timing.startTime
        if (timing.endTime != null) segment.endTime = timing.endTime
        yield { type: isFinal ? 'final' : 'interim', segment }
        if (isFinal) recognizer.reset(stream)
      }
    }
  }

  private async createOnlineRecognizer(options?: RecognitionOptions) {
    const modelId = options?.modelId
    if (!modelId) {
      throw new ConfigurationError(
        this.id,
        'No model selected — pass options.modelId to recognize/transcribe'
      )
    }

    const entry = this.requireEntry(modelId)
    const arch = this.lookupArchitecture(entry)
    const runtime = await this.resolveModelRuntime(modelId)

    const description = arch.describe(runtime.modelPath)
    if (description.files === null) {
      throw new ConfigurationError(
        this.id,
        `Selected model "${modelId}" is missing files: ${description.missing.join(', ')}`
      )
    }

    const sherpa = await import('sherpa-onnx-node').catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err)
      throw new TranscriptionError(
        this.id,
        `sherpa-onnx-node failed to load: ${reason}`,
        err
      )
    })

    const recognizerConfig = arch.buildRecognizerConfig(runtime.modelPath, description.files)
    const recognizer: SherpaOnlineRecognizerLike = new sherpa.OnlineRecognizer(recognizerConfig)
    const stream: SherpaOnlineStreamLike = recognizer.createStream()
    return { recognizer, stream }
  }

  private requireEntry(modelId: string): SherpaModelManifestEntry {
    const entry = this.models.find((m) => m.id === modelId)
    if (!entry) {
      throw new TranscriptionError(this.id, `Unknown model: ${modelId}`)
    }
    return entry
  }

  private lookupArchitecture(entry: SherpaModelManifestEntry): SherpaArchitecture {
    const extra = this.extraArchitectures.find((a) => a.id === entry.architecture)
    const arch = extra ?? findArchitecture(entry.architecture)
    if (!arch) {
      throw new TranscriptionError(
        this.id,
        `Model "${entry.id}" references unknown architecture "${entry.architecture}"`
      )
    }
    return arch
  }
}

// ---------- Helpers ----------

/**
 * Streams an HTTPS GET response directly to disk, yielding `downloading`
 * progress events as bytes arrive. Follows up to MAX_REDIRECTS 301/302
 * responses. On abort or HTTP error, the partial file is removed before
 * the iterator throws.
 */
async function* streamDownload(
  providerId: string,
  url: string,
  destPath: string,
  signal?: AbortSignal,
  redirectsLeft = MAX_REDIRECTS
): AsyncIterable<LocalModelInstallEvent> {
  if (redirectsLeft < 0) {
    throw new TranscriptionError(providerId, 'Too many redirects')
  }

  const queue = new AsyncPushQueue<LocalModelInstallEvent>()
  let redirectUrl: string | null = null
  let downloaded = 0
  let total = 0
  let writeStream: fs.WriteStream | null = null

  const cleanupPartial = () => {
    writeStream?.destroy()
    fs.rmSync(destPath, { force: true })
  }

  const request = https.get(url, (res) => {
    const status = res.statusCode ?? 0
    if (status === 301 || status === 302) {
      const location = res.headers.location
      if (location) {
        redirectUrl = location
        queue.end()
      } else {
        queue.fail(new TranscriptionError(providerId, 'Redirect with no Location header'))
      }
      return
    }
    if (status !== 200) {
      queue.fail(new TranscriptionError(providerId, `Download failed with HTTP ${status}`))
      return
    }

    total = Number.parseInt(res.headers['content-length'] ?? '0', 10)
    writeStream = fs.createWriteStream(destPath)

    signal?.addEventListener('abort', () => {
      request.destroy()
      cleanupPartial()
      queue.fail(new TranscriptionError(providerId, 'Download aborted'))
    })

    res.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      queue.push({ phase: 'downloading', downloadedBytes: downloaded, totalBytes: total })
    })
    res.pipe(writeStream)
    writeStream.on('finish', () => queue.end())
    writeStream.on('error', (err) => {
      cleanupPartial()
      queue.fail(new TranscriptionError(providerId, err.message, err))
    })
    res.on('error', (err) => {
      cleanupPartial()
      queue.fail(new TranscriptionError(providerId, err.message, err))
    })
  })

  request.on('error', (err) => {
    cleanupPartial()
    queue.fail(new TranscriptionError(providerId, err.message, err))
  })

  yield* queue.drain()

  if (redirectUrl) {
    yield* streamDownload(providerId, redirectUrl, destPath, signal, redirectsLeft - 1)
  }
}

/**
 * Verifies the on-disk archive against the manifest entry.
 *
 * - When `entry.sha256` is set, computes the sha256 of the archive (streamed,
 *   not loaded into memory) and rejects mismatches. This is the strong check.
 * - When `entry.sha256` is absent, asserts the file's byte count equals
 *   `entry.sizeBytes`. This catches truncation and mid-flight errors but
 *   doesn't protect against a malicious upstream — the trust anchor in that
 *   case is the HTTPS connection to GitHub's release CDN.
 */
function verifyArchiveIntegrity(
  providerId: string,
  filePath: string,
  entry: SherpaModelManifestEntry
): void {
  if (entry.sha256) {
    const hash = crypto.createHash('sha256')
    const fd = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(64 * 1024)
      let bytesRead: number
      while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
        hash.update(buffer.subarray(0, bytesRead))
      }
    } finally {
      fs.closeSync(fd)
    }
    const actual = hash.digest('hex')
    if (actual !== entry.sha256) {
      throw new TranscriptionError(
        providerId,
        `Downloaded archive sha256 mismatch for ${path.basename(filePath)} (expected ${entry.sha256}, got ${actual})`
      )
    }
    return
  }

  const actualSize = fs.statSync(filePath).size
  if (actualSize !== entry.sizeBytes) {
    throw new TranscriptionError(
      providerId,
      `Downloaded archive size mismatch for ${path.basename(filePath)} (expected ${entry.sizeBytes} bytes, got ${actualSize}); set sha256 in the manifest for stronger verification`
    )
  }
}

/**
 * Extracts a tar.bz2 archive into `modelDir` (which the archive expects as the
 * extraction root because its top-level entry is `subDir`), then renames the
 * extracted directory to `*.staging` so we can validate before publishing.
 *
 * Uses the system `tar` binary; on Windows builds, swap for a node tar/bz2 lib.
 */
function extractTarBz2ToStaging(
  providerId: string,
  archivePath: string,
  modelDir: string,
  subDir: string,
  stagingPath: string
): void {
  fs.rmSync(stagingPath, { recursive: true, force: true })
  try {
    execFileSync('tar', ['-xjf', archivePath, '-C', modelDir])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new TranscriptionError(providerId, `tar extraction failed: ${message}`, err)
  }
  const extractedPath = path.join(modelDir, subDir)
  if (!fs.existsSync(extractedPath)) {
    throw new TranscriptionError(
      providerId,
      `Archive did not contain expected directory "${subDir}"`
    )
  }
  fs.renameSync(extractedPath, stagingPath)
}

// ---------- Sherpa native bindings (thin stubs) ----------

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
