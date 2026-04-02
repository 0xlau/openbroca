import type { ProviderConnectionOption } from '../shared/connection.ts'
import type { ConfigSchema, Disposable } from '../shared/types.ts'

export interface TranscriptionSegment {
  text: string
  startTime?: number
  endTime?: number
  isFinal: boolean
}

export interface RecognitionInput {
  audio: Uint8Array | Uint8Array[] | AsyncIterable<Uint8Array>
  mimeType?: string
  encoding?: 'linear16' | 'pcm_f32le' | 'wav' | 'mp3' | 'ogg' | string
  sampleRate?: number
  channels?: number
}

export interface RecognitionOptions {
  language?: string
  signal?: AbortSignal
}

export interface RecognitionResult {
  text: string
  segments: TranscriptionSegment[]
  language?: string
  durationMs?: number
  usage?: Record<string, number>
  rawSummary?: Record<string, unknown>
}

export interface TranscriptionEvent {
  type: 'interim' | 'final'
  segment: TranscriptionSegment
}

export interface ASRCapabilities {
  nonStreaming: boolean
  streaming: boolean
}

export const DEFAULT_ASR_CAPABILITIES: ASRCapabilities = {
  nonStreaming: true,
  streaming: false,
}

export function resolveASRCapabilities(
  overrides: Partial<ASRCapabilities> = {}
): ASRCapabilities {
  return { ...DEFAULT_ASR_CAPABILITIES, ...overrides }
}

export interface ASRProvider extends Partial<Disposable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  recognize(input: RecognitionInput, options?: RecognitionOptions): Promise<RecognitionResult>
}

export interface StreamingASRProvider extends ASRProvider {
  transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent>
}

export type CloudASRProvider = ASRProvider

export interface LocalModelInfo {
  id: string
  name: string
  sizeBytes: number
  isDownloaded: boolean
  downloadUrl?: string
}

export interface DownloadProgress {
  modelId: string
  progress: number
  downloadedBytes: number
  totalBytes: number
}

export interface LocalASRProvider extends ASRProvider {
  listModels(): Promise<LocalModelInfo[]>
  downloadModel(modelId: string, signal?: AbortSignal): AsyncIterable<DownloadProgress>
  deleteModel(modelId: string): Promise<void>
}

export interface ASRProviderDescriptor<TConfig = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  kind: 'cloud' | 'local'
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<ASRCapabilities>
  connectionOptions?: ProviderConnectionOption[]
  create(config: TConfig): ASRProvider | StreamingASRProvider | LocalASRProvider
}

export function recognizeFromTranscribe(
  transcribe: (
    input: RecognitionInput,
    options?: RecognitionOptions
  ) => AsyncIterable<TranscriptionEvent>
): (input: RecognitionInput, options?: RecognitionOptions) => Promise<RecognitionResult> {
  return async (input, options) => {
    const segments: TranscriptionSegment[] = []

    for await (const event of transcribe(input, options)) {
      if (event.type === 'final') {
        segments.push(event.segment)
      }
    }

    const text = segments
      .map((segment) => segment.text)
      .join(' ')
      .trim()

    return { text, segments }
  }
}
