import OpenAI from 'openai'
import { ConfigurationError, ProviderError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider,
} from '../../contracts.ts'

export type OpenAICompatibleModelListStrategy = 'api' | 'static' | 'none'

export interface OpenAICompatibleStaticModel {
  id: string
  name?: string
  contextWindow?: number
}

export interface OpenAICompatibleConfig {
  apiKey?: string
  baseUrl: string
  modelListStrategy?: OpenAICompatibleModelListStrategy
}

export interface OpenAICompatibleProviderOptions {
  id: string
  displayName: string
  config: OpenAICompatibleConfig
  staticModels?: OpenAICompatibleStaticModel[]
  requiresApiKey?: boolean
}

type OpenAIUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = new URL(baseUrl)
  if (normalized.pathname === '/' || normalized.pathname === '') {
    normalized.pathname = '/v1'
    return normalized.toString()
  }

  return baseUrl
}

function normalizeFinishReason(reason: string | null | undefined): CompletionChunk['finishReason'] {
  return reason === 'length' ? 'length' : reason === 'stop' ? 'stop' : null
}

function normalizeModelListStrategy(
  value: OpenAICompatibleConfig['modelListStrategy']
): OpenAICompatibleModelListStrategy {
  return value === 'static' || value === 'none' ? value : 'api'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractAssistantText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (!isRecord(part)) {
        return ''
      }

      const maybeText = Reflect.get(part, 'text')
      return typeof maybeText === 'string' ? maybeText : ''
    })
    .join('')
}

function mapUsage(usage: unknown): CompletionResult['usage'] {
  if (!isRecord(usage)) {
    return undefined
  }

  const typedUsage = usage as OpenAIUsage
  const promptTokens = typedUsage.prompt_tokens ?? typedUsage.input_tokens
  const completionTokens = typedUsage.completion_tokens ?? typedUsage.output_tokens
  const totalTokens = typedUsage.total_tokens

  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return undefined
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
}

function sortModels(models: LLMModel[]): LLMModel[] {
  return [...models].sort((left, right) => {
    if (left.name < right.name) return -1
    if (left.name > right.name) return 1
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly id: string
  readonly displayName: string

  private readonly config: OpenAICompatibleConfig
  private readonly staticModels: OpenAICompatibleStaticModel[]
  private readonly requiresApiKey: boolean
  private client: OpenAI | null = null

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id
    this.displayName = options.displayName
    this.config = options.config
    this.staticModels = options.staticModels ?? []
    this.requiresApiKey = options.requiresApiKey ?? true
  }

  isConfigured(): boolean {
    if (!this.config.baseUrl.trim()) {
      return false
    }

    return !this.requiresApiKey || Boolean(this.config.apiKey?.trim())
  }

  async listModels(signal?: AbortSignal): Promise<LLMModel[]> {
    const strategy = normalizeModelListStrategy(this.config.modelListStrategy)

    if (strategy === 'none') {
      return []
    }

    if (strategy === 'static') {
      return this.listStaticModels()
    }

    const client = this.assertClient()
    const response = await client.models.list({ signal } as Parameters<typeof client.models.list>[0])
    return sortModels(
      response.data.map((model) => ({
        id: model.id,
        name: model.id
      }))
    )
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    const client = this.assertClient()
    const response = await client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
    }, { signal: request.signal })

    if (!isRecord(response) || !Array.isArray(response.choices)) {
      throw new ProviderError(this.id, 'Unsupported OpenAI-compatible response shape', response)
    }

    const choice = response.choices[0]
    return {
      content: extractAssistantText(choice?.message?.content),
      finishReason: normalizeFinishReason(choice?.finish_reason) ?? 'stop',
      usage: mapUsage(response.usage),
    }
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

  private listStaticModels(): LLMModel[] {
    return sortModels(
      this.staticModels.map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        contextWindow: model.contextWindow
      }))
    )
  }

  private assertClient(): OpenAI {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey?.trim() || 'not-needed',
        baseURL: normalizeBaseUrl(this.config.baseUrl),
        defaultHeaders: {
          'User-Agent': 'node'
        },
      })
    }

    return this.client
  }
}
