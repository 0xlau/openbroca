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
  TranscriptionEvent
} from '@openbroca/providers/asr'
import { ProviderError } from '@openbroca/providers'
import type { ProviderHost } from './host'

export interface RemoteASRProviderOptions {
  host: ProviderHost
  instanceId: string
  providerId: string
  displayName: string
  isLocal: boolean
}

// Implements both LocalASRProvider and StreamingASRProvider so the proxy can
// stand in for whichever shape the underlying provider implements. The
// `isLocal` flag (sourced from the descriptor's `kind`) gates the
// model-management methods so cloud providers fail loudly instead of silently
// hitting the wire.
export class RemoteASRProvider implements LocalASRProvider, StreamingASRProvider {
  readonly id: string
  readonly displayName: string
  private readonly host: ProviderHost
  private readonly instanceId: string
  private readonly isLocal: boolean

  constructor(opts: RemoteASRProviderOptions) {
    this.id = opts.providerId
    this.displayName = opts.displayName
    this.host = opts.host
    this.instanceId = opts.instanceId
    this.isLocal = opts.isLocal
  }

  // The proxy is only constructed after main-side resolution validates
  // the provider record is enabled and the config schema parses, so any
  // proxy that exists is "configured".
  isConfigured(): boolean {
    return true
  }

  async recognize(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): Promise<RecognitionResult> {
    const result = await this.host.invoke(
      this.instanceId,
      'recognize',
      [input, options ?? {}],
      { signal: options?.signal }
    )
    return result as RecognitionResult
  }

  transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    return this.host.invokeStream(
      this.instanceId,
      'transcribe',
      [input, options ?? {}],
      { signal: options?.signal }
    ) as AsyncIterable<TranscriptionEvent>
  }

  async listCatalogModels(): Promise<LocalCatalogModel[]> {
    this.assertLocal('listCatalogModels')
    return (await this.host.invoke(this.instanceId, 'listCatalogModels', [])) as LocalCatalogModel[]
  }

  async scanInstalledModels(): Promise<InstalledLocalModel[]> {
    this.assertLocal('scanInstalledModels')
    return (await this.host.invoke(
      this.instanceId,
      'scanInstalledModels',
      []
    )) as InstalledLocalModel[]
  }

  installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent> {
    this.assertLocal('installModel')
    return this.host.invokeStream(
      this.instanceId,
      'installModel',
      [modelId, signal],
      { signal }
    ) as AsyncIterable<LocalModelInstallEvent>
  }

  async removeInstalledModel(modelId: string): Promise<void> {
    this.assertLocal('removeInstalledModel')
    await this.host.invoke(this.instanceId, 'removeInstalledModel', [modelId])
  }

  async resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime> {
    this.assertLocal('resolveModelRuntime')
    return (await this.host.invoke(this.instanceId, 'resolveModelRuntime', [
      selectedModelId
    ])) as LocalModelRuntime
  }

  private assertLocal(method: string): void {
    if (!this.isLocal) {
      throw new ProviderError(
        this.id,
        `${method}() is not supported on cloud ASR provider ${this.id}`
      )
    }
  }
}
