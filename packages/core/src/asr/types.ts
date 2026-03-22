import type { ConfigSchema, Disposable } from '../types'

// ─── Transcription ────────────────────────────────────────────────────────────

export interface TranscriptionSegment {
  text: string
  /** Start time in seconds, if available */
  startTime?: number
  /** End time in seconds, if available */
  endTime?: number
  /** Whether this segment is final (won't be updated by subsequent segments) */
  isFinal: boolean
}

export interface TranscriptionOptions {
  /** Language code, e.g. "en-US", "zh-CN" */
  language?: string
  signal?: AbortSignal
}

// ─── Base provider ────────────────────────────────────────────────────────────

export interface ASRProvider extends Partial<Disposable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  /**
   * Stream transcription from an audio source.
   *
   * Audio input is `AsyncIterable<Uint8Array>` (raw PCM or encoded frames).
   * This abstraction is environment-agnostic: callers can wrap a MediaRecorder,
   * mic stream, or file reader.
   */
  transcribe(
    audio: AsyncIterable<Uint8Array>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptionSegment>
}

// ─── Cloud ASR ────────────────────────────────────────────────────────────────

/** Cloud-based ASR provider (e.g. Deepgram, Azure Speech). Config via descriptor. */
export type CloudASRProvider = ASRProvider

// ─── Local ASR ────────────────────────────────────────────────────────────────

export interface LocalModelInfo {
  id: string
  name: string
  /** Total model size in bytes */
  sizeBytes: number
  /** Whether this model has already been downloaded to disk */
  isDownloaded: boolean
  /** Download URL */
  downloadUrl?: string
}

export interface DownloadProgress {
  modelId: string
  /** 0..1 */
  progress: number
  downloadedBytes: number
  totalBytes: number
}

/** Local ASR provider (e.g. Sherpa-ONNX). Adds model file management on top of transcription. */
export interface LocalASRProvider extends ASRProvider {
  /** List available models (both downloaded and downloadable). */
  listModels(): Promise<LocalModelInfo[]>
  /**
   * Download a model. Yields progress events, resolves when download is complete.
   * Supports cancellation via `options.signal` passed to transcribe, or use the
   * AbortSignal parameter here.
   */
  downloadModel(modelId: string, signal?: AbortSignal): AsyncIterable<DownloadProgress>
  /** Delete a downloaded model from disk. */
  deleteModel(modelId: string): Promise<void>
}

// ─── Descriptor ───────────────────────────────────────────────────────────────

/**
 * A provider descriptor is the single extensible entry point for adding a new ASR provider.
 *
 * @example
 * export const deepgramDescriptor: ASRProviderDescriptor<DeepgramConfig> = {
 *   id: 'deepgram',
 *   displayName: 'Deepgram',
 *   description: 'Real-time speech recognition via Deepgram API',
 *   kind: 'cloud',
 *   configSchema: z.object({ apiKey: z.string() }),
 *   create: (config) => new DeepgramASRProvider(config),
 * }
 */
export interface ASRProviderDescriptor<TConfig = unknown> {
  id: string
  displayName: string
  description: string
  /** 'cloud' = API-based, 'local' = runs on-device (adds model management) */
  kind: 'cloud' | 'local'
  /** Any schema with a `.parse(unknown): TConfig` method. */
  configSchema: ConfigSchema<TConfig>
  create(config: TConfig): CloudASRProvider | LocalASRProvider
}
