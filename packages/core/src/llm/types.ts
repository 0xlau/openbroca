import type { ConfigSchema, Disposable, HealthCheckable } from '../types'

// ─── Models ─────────────────────────────────────────────────────────────────

export interface LLMModel {
  id: string
  name: string
  contextWindow?: number
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ─── Completion ───────────────────────────────────────────────────────────────

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

// ─── Core streaming function type ────────────────────────────────────────────

export type CompletionFn = (request: CompletionRequest) => AsyncIterable<CompletionChunk>

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Wraps a CompletionFn and returns a new one.
 *
 * @example
 * const loggingMiddleware: LLMMiddleware = (next) => {
 *   return async function* (request) {
 *     const start = performance.now()
 *     try {
 *       for await (const chunk of next(request)) {
 *         yield chunk
 *       }
 *     } finally {
 *       console.log(`Completion took ${performance.now() - start}ms`)
 *     }
 *   }
 * }
 */
export type LLMMiddleware = (next: CompletionFn) => CompletionFn

/** Compose middlewares around a handler. Outermost middleware in array runs first. */
export function composeMiddleware(middlewares: LLMMiddleware[], handler: CompletionFn): CompletionFn {
  return middlewares.reduceRight((next, mw) => mw(next), handler)
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export interface LLMCapabilities {
  streaming: boolean
  functionCalling: boolean
  vision: boolean
  jsonMode: boolean
}

// ─── Provider interface (consumer-facing) ────────────────────────────────────

export interface LLMProvider extends Partial<Disposable>, Partial<HealthCheckable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  listModels(signal?: AbortSignal): Promise<LLMModel[]>
  complete(request: CompletionRequest): AsyncIterable<CompletionChunk>
}

// ─── Descriptor (contributor-facing) ─────────────────────────────────────────

/**
 * A provider descriptor is the single extensible entry point for adding a new LLM provider.
 * Contributors export one descriptor object per provider — it contains everything
 * the registry needs: metadata, config validation schema, capabilities, and a factory.
 *
 * @example
 * export const myProviderDescriptor: LLMProviderDescriptor<MyConfig> = {
 *   id: 'my-provider',
 *   displayName: 'My Provider',
 *   description: 'Custom LLM provider',
 *   configSchema: z.object({ apiKey: z.string() }),
 *   capabilities: { streaming: true, functionCalling: false, vision: false, jsonMode: false },
 *   create: (config) => new MyProvider(config),
 * }
 */
export interface LLMProviderDescriptor<TConfig = unknown> {
  id: string
  displayName: string
  description: string
  /** Any schema with a `.parse(unknown): TConfig` method — Zod, Valibot, ArkType all qualify. */
  configSchema: ConfigSchema<TConfig>
  /** Declare what this provider supports. Unspecified keys default to false in the registry. */
  capabilities?: Partial<LLMCapabilities>
  create(config: TConfig): LLMProvider
}
