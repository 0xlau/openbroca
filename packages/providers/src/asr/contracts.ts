import type { ProviderConnectionOption } from '../shared/connection.ts'
import type { ConfigSchema, Disposable } from '../shared/types.ts'
import type {
  ProviderSettingsItem,
  ProviderSetupContext,
  ProviderSetupStatus
} from '../shared/settings.ts'

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
  /**
   * Active model identifier. Local ASR providers require this to pick the
   * recognizer to load; cloud providers ignore it. The runtime layer reads
   * `providerSettings[id].selectedModelId` and passes it through here so
   * switching the active local model doesn't require rebuilding the provider.
   */
  modelId?: string
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

export interface LocalCatalogModel {
  id: string
  name: string
  description?: string
  sizeBytes: number
  downloadUrl: string
  /**
   * Optional sha256 hex digest of the archive. When present, install must
   * verify and reject mismatches. When absent, providers should fall back to a
   * weaker integrity check — typically asserting the downloaded byte count
   * matches `sizeBytes` — and rely on HTTPS to the upstream host for the rest.
   *
   * Catalog entries shipped without a sha256 indicate the upstream release
   * does not publish hashes; users wanting strict verification can fill the
   * value via `pnpm sherpa:hash <model-id>`.
   */
  sha256?: string
  /**
   * ISO language tags this model is intended for (e.g. ['en'], ['zh', 'zh-CN']).
   * UI uses these to highlight a recommended default based on app locale.
   */
  recommendedFor?: string[]
}

export interface InstalledLocalModel {
  id: string
  name: string
  path: string
  sizeBytes?: number
}

export interface LocalModelRuntime {
  modelId: string
  modelPath: string
}

/**
 * Discriminated union of install lifecycle events. Only `downloading` carries
 * percentage data; the other phases are short and emit once each.
 */
export type LocalModelInstallEvent =
  | { phase: 'downloading'; downloadedBytes: number; totalBytes: number }
  | { phase: 'extracting' }
  | { phase: 'validating' }
  | { phase: 'finalizing' }

export interface LocalASRProvider extends ASRProvider {
  listCatalogModels(): Promise<LocalCatalogModel[]>
  scanInstalledModels(): Promise<InstalledLocalModel[]>
  installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent>
  removeInstalledModel(modelId: string): Promise<void>
  resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime>
}

export interface ASRProviderDescriptor<TConfig = unknown, TSettings = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  kind: 'cloud' | 'local'
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<ASRCapabilities>
  connectionOptions?: ProviderConnectionOption[]
  settingsSchema?: ConfigSchema<TSettings>
  settingsItems?: ProviderSettingsItem[]
  getSetupStatus?: (
    context: ProviderSetupContext
  ) => Promise<ProviderSetupStatus> | ProviderSetupStatus
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
