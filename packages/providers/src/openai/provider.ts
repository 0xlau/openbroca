import { ConfigurationError } from '@openbroca/core'
import type {
  CompletionChunk,
  CompletionRequest,
  LLMModel,
  LLMProvider,
} from '@openbroca/core/llm'
import OpenAI from 'openai'

export interface OpenAIConfig {
  apiKey: string
  baseUrl?: string
  organization?: string
}

export class OpenAILLMProvider implements LLMProvider {
  readonly id = 'openai'
  readonly displayName = 'OpenAI'

  private client: OpenAI | null = null

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
    })
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  async listModels(signal?: AbortSignal): Promise<LLMModel[]> {
    const client = this.assertClient()
    const response = await client.models.list({ signal } as Parameters<typeof client.models.list>[0])
    return response.data
      .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3') || m.id.startsWith('o4'))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, name: m.id }))
  }

  async *complete(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const client = this.assertClient()

    const stream = await client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    }, { signal: request.signal })

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue

      const delta = choice.delta.content ?? ''
      const finishReason = choice.finish_reason as CompletionChunk['finishReason'] ?? null

      if (delta || finishReason) {
        yield { delta, finishReason }
      }
    }
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.listModels()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  private assertClient(): OpenAI {
    if (!this.client) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }
    return this.client
  }
}
