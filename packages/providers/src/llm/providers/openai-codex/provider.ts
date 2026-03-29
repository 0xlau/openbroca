import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '../../contracts.ts'

export interface OpenAICodexConfig {}

export class OpenAICodexLLMProvider implements LLMProvider {
  readonly id = 'openai-codex'
  readonly displayName = 'OpenAI Codex'

  constructor(_config: OpenAICodexConfig) {}

  isConfigured(): boolean {
    return false
  }

  async listModels(_signal?: AbortSignal): Promise<LLMModel[]> {
    throw new ConfigurationError(
      this.id,
      'OpenAI Codex OAuth is not configured yet.'
    )
  }

  async generate(_request: CompletionRequest): Promise<CompletionResult> {
    throw new ConfigurationError(
      this.id,
      'OpenAI Codex OAuth is not configured yet.'
    )
  }

  async *complete(_request: CompletionRequest): AsyncIterable<CompletionChunk> {
    throw new ConfigurationError(
      this.id,
      'OpenAI Codex OAuth is not configured yet.'
    )
  }
}
