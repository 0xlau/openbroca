import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '../../contracts.ts'
import { OpenRouter } from '@openrouter/sdk'

export interface OpenRouterConfig {
  apiKey: string
}

const normalizeFinishReason = (reason: unknown): CompletionChunk['finishReason'] => {
  if (reason === 'length' || reason === 'stop') {
    return reason
  }
  return null
}

export class OpenRouterLLMProvider implements LLMProvider {
  readonly id = 'openrouter'
  readonly displayName = 'OpenRouter'
  private readonly config: OpenRouterConfig
  private client: OpenRouter | null = null

  constructor(config: OpenRouterConfig) {
    this.config = config
  }

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0
  }

  private assertClient(): OpenRouter {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    if (!this.client) {
      this.client = new OpenRouter({ apiKey: this.config.apiKey.trim() })
    }

    return this.client
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.listModels()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }

  async listModels(signal?: AbortSignal): Promise<LLMModel[]> {
    const client = this.assertClient()
    const apiKey = this.config.apiKey.trim()

    const result = await client.models.listForUser(
      { bearer: apiKey },
      undefined,
      { signal }
    )

    const models = result.data.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      contextWindow: model.contextLength ?? undefined
    }))

    models.sort((a, b) => {
      // Deterministic sort (no locale/ICU variability): by name, then id.
      if (a.name < b.name) return -1
      if (a.name > b.name) return 1
      if (a.id < b.id) return -1
      if (a.id > b.id) return 1
      return 0
    })

    return models
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    const client = this.assertClient()

    const response = await client.chat.send({
      chatRequest: {
        stream: false,
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens
      }
    }, { signal: request.signal })

    const choice = response.choices[0]
    const content = typeof choice?.message?.content === 'string' ? choice.message.content : ''
    const finishReason = normalizeFinishReason(choice?.finishReason) ?? 'stop'

    return {
      content,
      finishReason,
      usage: response.usage
        ? {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens
          }
        : undefined
    }
  }

  async *complete(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const client = this.assertClient()

    const stream = await client.chat.send({
      chatRequest: {
        stream: true,
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens
      }
    }, { signal: request.signal })

    let terminalFinishReason: CompletionChunk['finishReason'] = null

    for await (const chunk of stream) {
      if (chunk.error) {
        // The SDK surfaced a structured error object within the stream.
        throw new Error(chunk.error.message)
      }

      for (const choice of chunk.choices) {
        const delta = choice.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          yield { delta, finishReason: null }
        }

        const normalized = normalizeFinishReason(choice.finishReason)
        if (normalized) {
          terminalFinishReason = normalized
        }
      }
    }

    yield { delta: '', finishReason: terminalFinishReason }
  }
}
