import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  ChatMessage,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '../../contracts.ts'

const OPENAI_CODEX_AUTH_NAMESPACE = 'https://api.openai.com/auth'
const OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const OPENAI_CODEX_MODELS = [
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1-codex-max',
  'gpt-5.1'
] as const

interface CodexResponseUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

interface CodexResponseBody {
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  output_text?: string
  usage?: CodexResponseUsage
  incomplete_details?: {
    reason?: string
  }
}

interface CodexStreamEvent {
  type?: string
  delta?: string
  response?: CodexResponseBody
}

export interface OpenAICodexConfig {
  accessToken?: string
  accountId?: string
  baseUrl?: string
  fetchFn?: typeof fetch
  originator?: string
}

function decodeChatGptAccountId(accessToken: string): string | undefined {
  const [, payload] = accessToken.split('.')
  if (!payload) {
    return undefined
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    const namespace = parsed[OPENAI_CODEX_AUTH_NAMESPACE]
    if (
      namespace &&
      typeof namespace === 'object' &&
      'chatgpt_account_id' in namespace &&
      typeof namespace.chatgpt_account_id === 'string'
    ) {
      return namespace.chatgpt_account_id
    }
  } catch {
    return undefined
  }

  return undefined
}

function mapRole(role: ChatMessage['role']): 'assistant' | 'developer' | 'user' {
  return role === 'system' ? 'developer' : role
}

function mapMessage(message: ChatMessage) {
  return {
    type: 'message',
    role: mapRole(message.role),
    content: [
      {
        type: message.role === 'assistant' ? 'output_text' : 'input_text',
        text: message.content
      }
    ]
  }
}

function extractContent(response: CodexResponseBody): string {
  if (typeof response.output_text === 'string' && response.output_text.length > 0) {
    return response.output_text
  }

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text ?? '')
    .join('')
}

function mapFinishReason(response: CodexResponseBody): CompletionResult['finishReason'] {
  return response.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'stop'
}

function mapUsage(usage: CodexResponseUsage | undefined): CompletionResult['usage'] {
  if (!usage) {
    return undefined
  }

  return {
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0
  }
}

async function* parseEventStream(response: Response): AsyncIterable<CodexStreamEvent> {
  const body = response.body
  if (!body) {
    throw new Error('OpenAI Codex response stream was empty')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex !== -1) {
      const chunk = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      separatorIndex = buffer.indexOf('\n\n')

      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')

      if (!data || data === '[DONE]') {
        continue
      }

      yield JSON.parse(data) as CodexStreamEvent
    }

    if (done) {
      break
    }
  }
}

export class OpenAICodexLLMProvider implements LLMProvider {
  readonly id = 'openai-codex'
  readonly displayName = 'OpenAI Codex'

  private readonly accessToken?: string
  private readonly accountId?: string
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch
  private readonly originator: string

  constructor(config: OpenAICodexConfig) {
    this.accessToken = config.accessToken
    this.accountId = config.accountId ?? (config.accessToken ? decodeChatGptAccountId(config.accessToken) : undefined)
    this.baseUrl = config.baseUrl ?? OPENAI_CODEX_BASE_URL
    this.fetchFn = config.fetchFn ?? fetch
    this.originator = config.originator ?? 'codex_cli_rs'
  }

  isConfigured(): boolean {
    return !!this.accessToken && !!this.accountId
  }

  async listModels(_signal?: AbortSignal): Promise<LLMModel[]> {
    this.assertConfigured()
    return OPENAI_CODEX_MODELS.map((model) => ({ id: model, name: model }))
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    const response = await this.requestResponses(request, false)
    const streamedEvents = parseEventStream(response)
    let completedResponse: CodexResponseBody | undefined

    for await (const event of streamedEvents) {
      if (
        (event.type === 'response.completed' || event.type === 'response.done') &&
        event.response
      ) {
        completedResponse = event.response
      }
    }

    if (!completedResponse) {
      throw new Error('OpenAI Codex did not return a completed response')
    }

    return {
      content: extractContent(completedResponse),
      finishReason: mapFinishReason(completedResponse),
      usage: mapUsage(completedResponse.usage)
    }
  }

  async *complete(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const response = await this.requestResponses(request, true)

    for await (const event of parseEventStream(response)) {
      if (event.type === 'response.output_text.delta') {
        yield { delta: event.delta ?? '', finishReason: null }
      }

      if (
        (event.type === 'response.completed' || event.type === 'response.done') &&
        event.response
      ) {
        yield {
          delta: '',
          finishReason: mapFinishReason(event.response)
        }
      }
    }
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.listModels()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }

  private assertConfigured(): { accessToken: string; accountId: string } {
    if (!this.accessToken || !this.accountId) {
      throw new ConfigurationError(this.id, 'OpenAI Codex OAuth is not configured yet.')
    }

    return {
      accessToken: this.accessToken,
      accountId: this.accountId
    }
  }

  private async requestResponses(
    request: CompletionRequest,
    stream: boolean
  ): Promise<Response> {
    const { accessToken, accountId } = this.assertConfigured()
    const response = await this.fetchFn(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'chatgpt-account-id': accountId,
        'content-type': 'application/json',
        'openai-beta': 'responses=experimental',
        originator: this.originator
      },
      body: JSON.stringify({
        model: request.model,
        store: false,
        stream,
        input: request.messages.map(mapMessage),
        temperature: request.temperature,
        max_output_tokens: request.maxTokens
      })
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`[${this.id}] request failed with HTTP ${response.status}: ${message}`)
    }

    return response
  }
}
