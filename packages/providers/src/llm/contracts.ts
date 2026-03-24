import type { ConfigSchema, Disposable, HealthCheckable } from '../shared/types.ts'

export interface LLMModel {
  id: string
  name: string
  contextWindow?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface CompletionChunk {
  delta: string
  finishReason?: 'stop' | 'length' | null
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface CompletionResult {
  content: string
  finishReason: 'stop' | 'length'
  usage?: TokenUsage
}

export type CompletionFn = (request: CompletionRequest) => AsyncIterable<CompletionChunk>

export type LLMMiddleware = (next: CompletionFn) => CompletionFn

export function composeMiddleware(middlewares: LLMMiddleware[], handler: CompletionFn): CompletionFn {
  return middlewares.reduceRight((next, middleware) => middleware(next), handler)
}

export interface LLMCapabilities {
  streaming: boolean
  functionCalling: boolean
  vision: boolean
  jsonMode: boolean
}

export interface LLMProvider extends Partial<Disposable>, Partial<HealthCheckable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  listModels(signal?: AbortSignal): Promise<LLMModel[]>
  complete(request: CompletionRequest): AsyncIterable<CompletionChunk>
}

export interface LLMProviderDescriptor<TConfig = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<LLMCapabilities>
  create(config: TConfig): LLMProvider
}
