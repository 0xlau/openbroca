import type { ConfigSchema, Disposable, HealthCheckable } from '../shared/types.ts'
import type { ProviderConnectionOption } from '../shared/connection.ts'
import type { ProviderSecureStorageOption } from '../shared/oauth.ts'
import type {
  ProviderSettingsItem,
  ProviderSetupContext,
  ProviderSetupStatus
} from '../shared/settings.ts'

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

export type CompletionStreamFn = (request: CompletionRequest) => AsyncIterable<CompletionChunk>
export type CompletionGenerateFn = (request: CompletionRequest) => Promise<CompletionResult>

export interface LLMMiddleware {
  wrapGenerate?: (next: CompletionGenerateFn) => CompletionGenerateFn
  wrapComplete?: (next: CompletionStreamFn) => CompletionStreamFn
}

export function composeCompleteMiddleware(
  middlewares: LLMMiddleware[],
  handler: CompletionStreamFn
): CompletionStreamFn {
  return middlewares.reduceRight(
    (next, middleware) => (middleware.wrapComplete ? middleware.wrapComplete(next) : next),
    handler
  )
}

export function composeGenerateMiddleware(
  middlewares: LLMMiddleware[],
  handler: CompletionGenerateFn
): CompletionGenerateFn {
  return middlewares.reduceRight(
    (next, middleware) => (middleware.wrapGenerate ? middleware.wrapGenerate(next) : next),
    handler
  )
}

export function generateFromCompletion(complete: CompletionStreamFn): CompletionGenerateFn {
  return async (request) => {
    let content = ''
    let finishReason: CompletionChunk['finishReason'] = null

    for await (const chunk of complete(request)) {
      content += chunk.delta
      if (chunk.finishReason) {
        finishReason = chunk.finishReason
      }
    }

    return { content, finishReason: finishReason ?? 'stop' }
  }
}

export interface LLMCapabilities {
  streaming: boolean
  nonStreaming: boolean
  functionCalling: boolean
  vision: boolean
  jsonMode: boolean
}

export interface LLMProvider extends Partial<Disposable>, Partial<HealthCheckable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  listModels(signal?: AbortSignal): Promise<LLMModel[]>
  generate(request: CompletionRequest): Promise<CompletionResult>
  complete(request: CompletionRequest): AsyncIterable<CompletionChunk>
}

export interface LLMProviderDescriptor<TConfig = unknown, TSettings = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<LLMCapabilities>
  connectionOptions?: ProviderConnectionOption[]
  secureStorage?: ProviderSecureStorageOption
  settingsSchema?: ConfigSchema<TSettings>
  settingsItems?: ProviderSettingsItem[]
  getSetupStatus?: (
    context: ProviderSetupContext
  ) => Promise<ProviderSetupStatus> | ProviderSetupStatus
  create(config: TConfig): LLMProvider
}
