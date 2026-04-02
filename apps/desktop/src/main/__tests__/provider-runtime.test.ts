import { beforeEach, describe, expect, test, vi } from 'vitest'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import type { CompletionChunk } from '@openbroca/providers/llm'
import { OAuthService } from '../auth/oauth-service'
import type { SecureStorage } from '../auth/secure-storage'
import {
  getActiveASRProviderId,
  getActiveLLMProviderId,
  getLLMProviderRuntimeConfig,
  resolveActiveLLMProvider,
  resolveLLMProvider
} from '../providers/runtime'

class MemoryStore {
  private state: Record<string, unknown> = {
    providers: {
      providers: {},
      activeProviders: {}
    }
  }

  get<T>(key: string): T | undefined {
    return this.state[key] as T | undefined
  }

  set(key: string, value: unknown): void {
    this.state[key] = value
  }
}

function createAccessToken(accountId = 'acct_123'): string {
  return [
    'header',
    Buffer.from(
      JSON.stringify({
        sub: 'user_123',
        'https://api.openai.com/auth': {
          chatgpt_account_id: accountId
        }
      })
    ).toString('base64url'),
    'signature'
  ].join('.')
}

function createEventStreamResponse(events: unknown[]): Response {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(payload, {
    headers: {
      'content-type': 'text/event-stream'
    },
    status: 200
  })
}

describe('provider runtime resolution', () => {
  const fetchFn = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchFn.mockReset()
    vi.stubGlobal('fetch', fetchFn)
  })

  test('resolves openai-codex from keytar-backed oauth state and can use listModels/generate/complete', async () => {
    const accessToken = createAccessToken('acct_codex')
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () =>
        JSON.stringify({
          accessToken
        })
      ),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth',
          account: {
            accountId: 'acct_codex'
          },
          auth: {
            status: 'connected',
            lastConnectedAt: '2026-03-30T00:00:00.000Z'
          }
        }
      },
      activeProviders: {
        llm: 'openai-codex'
      }
    })

    const oauthService = new OAuthService({
      secureStorage,
      store,
      providers: {
        'openai-codex': {
          authorize: vi.fn(),
          dispose: vi.fn()
        },
      }
    })
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register(openaiCodexDescriptor)

    fetchFn
      .mockResolvedValueOnce(
        createEventStreamResponse([
          {
            type: 'response.completed',
            response: {
              output: [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: 'hello from runtime' }]
                }
              ]
            }
          }
        ])
      )
      .mockResolvedValueOnce(
        createEventStreamResponse([
          {
            type: 'response.output_text.delta',
            delta: 'hello'
          },
          {
            type: 'response.completed',
            response: {
              output: []
            }
          }
        ])
      )

    const config = await getLLMProviderRuntimeConfig('openai-codex', {
      llmRegistry,
      oauthService,
      store
    })
    expect(config).toEqual({
      accessToken,
      accountId: 'acct_codex'
    })

    const provider = await resolveLLMProvider('openai-codex', {
      llmRegistry,
      oauthService,
      store
    })

    await expect(provider.listModels()).resolves.toEqual([
      { id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' },
      { id: 'gpt-5.2', name: 'gpt-5.2' },
      { id: 'gpt-5.1-codex', name: 'gpt-5.1-codex' },
      { id: 'gpt-5.1-codex-mini', name: 'gpt-5.1-codex-mini' },
      { id: 'gpt-5.1-codex-max', name: 'gpt-5.1-codex-max' },
      { id: 'gpt-5.1', name: 'gpt-5.1' }
    ])

    await expect(
      provider.generate({
        model: 'gpt-5.2-codex',
        messages: [{ role: 'user', content: 'Say hello' }]
      })
    ).resolves.toMatchObject({
      content: 'hello from runtime',
      finishReason: 'stop'
    })

    const chunks: CompletionChunk[] = []
    for await (const chunk of provider.complete({
      model: 'gpt-5.2-codex',
      messages: [{ role: 'user', content: 'stream' }]
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'hello', finishReason: null },
      { delta: '', finishReason: 'stop' }
    ])
  })

  test('reads active llm/asr provider IDs from structured provider settings', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth'
        },
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
          config: {
            apiKey: 'test'
          }
        }
      },
      activeProviders: {
        llm: 'openai-codex',
        asr: 'deepgram'
      }
    })

    expect(getActiveLLMProviderId(store)).toBe('openai-codex')
    expect(getActiveASRProviderId(store)).toBe('deepgram')
  })

  test('resolveActiveLLMProvider throws clear configuration error when no active llm is selected', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    const oauthService = new OAuthService({
      secureStorage,
      store,
      providers: {
        'openai-codex': {
          authorize: vi.fn(),
          dispose: vi.fn()
        }
      }
    })
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register(openaiCodexDescriptor)

    await expect(
      resolveActiveLLMProvider({
        llmRegistry,
        oauthService,
        store
      })
    ).rejects.toThrowError(
      '[provider:not-configured] Select an active LLM provider before requesting runtime access.'
    )
  })
})
