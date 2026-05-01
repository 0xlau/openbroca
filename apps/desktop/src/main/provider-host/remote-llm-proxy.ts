import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '@openbroca/providers/llm'
import type { ProviderHost } from './host'

export interface RemoteLLMProviderOptions {
  host: ProviderHost
  instanceId: string
  providerId: string
  displayName: string
}

// Forwards every contract method to the utility process. Optional methods on
// the contract (validateConnection from HealthCheckable) are exposed as plain
// instance methods — callers that need them are written to handle missing
// methods anyway, and the child returns method-not-implemented if the real
// provider doesn't define them.
export class RemoteLLMProvider implements LLMProvider {
  readonly id: string
  readonly displayName: string
  private readonly host: ProviderHost
  private readonly instanceId: string

  constructor(opts: RemoteLLMProviderOptions) {
    this.id = opts.providerId
    this.displayName = opts.displayName
    this.host = opts.host
    this.instanceId = opts.instanceId
  }

  isConfigured(): boolean {
    return true
  }

  async listModels(signal?: AbortSignal): Promise<LLMModel[]> {
    return (await this.host.invoke(
      this.instanceId,
      'listModels',
      [signal],
      { signal }
    )) as LLMModel[]
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    return (await this.host.invoke(
      this.instanceId,
      'generate',
      [request],
      { signal: request.signal }
    )) as CompletionResult
  }

  complete(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    return this.host.invokeStream(
      this.instanceId,
      'complete',
      [request],
      { signal: request.signal }
    ) as AsyncIterable<CompletionChunk>
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    return (await this.host.invoke(this.instanceId, 'validateConnection', [])) as {
      ok: boolean
      error?: string
    }
  }
}
