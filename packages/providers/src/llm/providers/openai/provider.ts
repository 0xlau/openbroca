import OpenAI from 'openai'
import { ConfigurationError } from '../../../shared/errors.ts'
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

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined
  }

  const normalized = new URL(baseUrl)
  if (normalized.pathname === '/' || normalized.pathname === '') {
    normalized.pathname = '/v1'
    return normalized.toString()
  }

  return baseUrl
}

type OpenAIUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
}

function normalizeFinishReason(reason: string | null | undefined): CompletionChunk['finishReason'] {
  return reason === 'length' ? 'length' : reason === 'stop' ? 'stop' : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toSerializable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return {
      unstringifiable: String(value)
    }
  }
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

function extractResponsesText(response: Record<string, unknown>): string {
  const outputText = Reflect.get(response, 'output_text')
  if (typeof outputText === 'string' && outputText.length > 0) {
    return outputText
  }

  const output = Reflect.get(response, 'output')
  if (!Array.isArray(output)) {
    return ''
  }

  return output
    .flatMap((item) => {
      if (!isRecord(item)) {
        return []
      }

      const content = Reflect.get(item, 'content')
      return Array.isArray(content) ? content : []
    })
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

function mapResponsesFinishReason(response: Record<string, unknown>): CompletionResult['finishReason'] {
  const incompleteDetails = Reflect.get(response, 'incomplete_details')

  if (!isRecord(incompleteDetails)) {
    return 'stop'
  }

  return Reflect.get(incompleteDetails, 'reason') === 'max_output_tokens' ? 'length' : 'stop'
}

export class OpenAIResponseShapeError extends Error {
  constructor(
    message: string,
    readonly rawResponse: unknown
  ) {
    super(message)
    this.name = 'OpenAIResponseShapeError'
  }
}

export class OpenAILLMProvider implements LLMProvider {
  readonly id = 'openai'
  readonly displayName = 'OpenAI'

  private client: OpenAI | null = null

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl),
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
    const client = this.assertClient()
    const response = await client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
    }, { signal: request.signal })

    const rawResponse = toSerializable(response)
    console.debug('[voice-debug] OpenAI raw response', rawResponse)

    if (isRecord(response) && Array.isArray(response.choices)) {
      const choice = response.choices[0]
      return {
        content: extractAssistantText(choice?.message?.content),
        finishReason: normalizeFinishReason(choice?.finish_reason) ?? 'stop',
        usage: mapUsage(response.usage),
      }
    }

    if (
      isRecord(response) &&
      (Object.hasOwn(response, 'output_text') || Array.isArray(Reflect.get(response, 'output')))
    ) {
      return {
        content: extractResponsesText(response),
        finishReason: mapResponsesFinishReason(response),
        usage: mapUsage(response.usage),
      }
    }

    console.debug('[voice-debug] OpenAI response parse failed', {
      message: 'Unsupported OpenAI response shape',
      rawResponse
    })

    throw new OpenAIResponseShapeError('Unsupported OpenAI response shape', rawResponse)
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
