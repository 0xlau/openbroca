import OpenAI from 'openai'
import { ConfigurationError } from '../../../shared/errors.ts'
import { generateFromCompletion } from '../../contracts.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider,
} from '../../contracts.ts'

export interface OpenAIConfig {
  apiKey: string
  baseUrl?: string
  organization?: string
}

function normalizeFinishReason(reason: string | null | undefined): CompletionChunk['finishReason'] {
  return reason === 'length' ? 'length' : reason === 'stop' ? 'stop' : null
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
      .filter((model) => model.id.startsWith('gpt-') || model.id.startsWith('o1') || model.id.startsWith('o3') || model.id.startsWith('o4'))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((model) => ({ id: model.id, name: model.id }))
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    return generateFromCompletion((nextRequest) => this.complete(nextRequest))(request)
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
      const finishReason = normalizeFinishReason(choice.finish_reason)

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
