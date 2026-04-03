import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '../../contracts.ts'

export interface OpenRouterConfig {
  apiKey: string
}

export class OpenRouterLLMProvider implements LLMProvider {
  readonly id = 'openrouter'
  readonly displayName = 'OpenRouter'
  private readonly config: OpenRouterConfig

  constructor(config: OpenRouterConfig) {
    this.config = config
  }

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0
  }

  async listModels(_signal?: AbortSignal): Promise<LLMModel[]> {
    throw new ConfigurationError(this.id, 'Provider methods are not implemented yet')
  }

  async generate(_request: CompletionRequest): Promise<CompletionResult> {
    throw new ConfigurationError(this.id, 'Provider methods are not implemented yet')
  }

  async *complete(_request: CompletionRequest): AsyncIterable<CompletionChunk> {
    throw new ConfigurationError(this.id, 'Provider methods are not implemented yet')
  }
}
