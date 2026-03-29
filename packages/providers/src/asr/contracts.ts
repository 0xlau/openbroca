import type { ConfigSchema, Disposable } from '../shared/types.ts'
import type { ProviderConnectionOption } from '../shared/connection.ts'

export interface TranscriptionSegment {
  text: string
  startTime?: number
  endTime?: number
  isFinal: boolean
}

export interface TranscriptionOptions {
  language?: string
  signal?: AbortSignal
}

export interface ASRProvider extends Partial<Disposable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  transcribe(
    audio: AsyncIterable<Uint8Array>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptionSegment>
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
  connectionOptions?: ProviderConnectionOption[]
  create(config: TConfig): CloudASRProvider | LocalASRProvider
}
