import { beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import type { Context } from '../trpc/context'
import { providersRouter } from '../trpc/routers/providers'
import { OAuthService } from '../auth/oauth-service'
import type { SecureStorage } from '../auth/secure-storage'

const openrouterSdk = vi.hoisted(() => {
  const modelsListForUser = vi.fn()
  const chatSend = vi.fn()

  class OpenRouter {
    models = { listForUser: modelsListForUser }
    chat = { send: chatSend }

    constructor(_opts: unknown) {}
  }

  return {
    OpenRouter,
    modelsListForUser,
    chatSend
  }
})

vi.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: openrouterSdk.OpenRouter
  }
})

class MemoryStore {
  private state: Record<string, unknown> = {
    providers: {}
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
        'https://api.openai.com/auth': {
          chatgpt_account_id: accountId
        }
      })
    ).toString('base64url'),
    'signature'
  ].join('.')
}

describe('providersRouter', () => {
  const fetchFn = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchFn.mockReset()
    vi.stubGlobal('fetch', fetchFn)

    openrouterSdk.modelsListForUser.mockReset()
    openrouterSdk.modelsListForUser.mockResolvedValue({
      data: [
        {
          id: 'openai/gpt-4.1-mini',
          name: 'openai/gpt-4.1-mini',
          contextLength: 128_000
        }
      ]
    })
  })

  test('listModels resolves openai-codex from oauth state in main', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => JSON.stringify({ accessToken: createAccessToken('acct_codex') })),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
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
    })

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

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      oauthService
    } as unknown as Context)

    const models = await caller.listModels({ providerId: 'openai-codex' })

    expect(models[0]).toEqual({ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' })
    expect(models).toHaveLength(6)
  })

  test('listASR returns normalized capabilities', async () => {
    const llmRegistry = new LLMProviderRegistry()
    const asrRegistry = new ASRProviderRegistry()
    const store = new MemoryStore()
    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    asrRegistry.register(deepgramDescriptor)
    asrRegistry.register({
      id: 'mock-asr',
      displayName: 'Mock ASR',
      description: 'Mock ASR provider',
      kind: 'cloud',
      configSchema: z.object({}),
      create: () => ({
        id: 'mock-asr',
        displayName: 'Mock ASR',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] })
      })
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const providers = await caller.listASR()
    const deepgram = providers.find((provider) => provider.id === 'deepgram')
    const mock = providers.find((provider) => provider.id === 'mock-asr')

    expect(deepgram?.capabilities).toEqual({ nonStreaming: true, streaming: true })
    expect(mock?.capabilities).toEqual({ nonStreaming: true, streaming: false })
  })

  test('listModels resolves openrouter from manual apiKey provider settings', async () => {
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register(openrouterDescriptor)

    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        openrouter: {
          enabled: true,
          connectionType: 'apiKey',
          config: {
            apiKey: 'or-key'
          }
        }
      },
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      oauthService
    } as unknown as Context)

    const models = await caller.listModels({ providerId: 'openrouter' })
    expect(models[0]?.id).toBeTruthy()
  })
})
