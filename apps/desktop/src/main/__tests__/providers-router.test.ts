import { beforeEach, describe, expect, test, vi } from 'vitest'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import type { Context } from '../trpc/context'
import { providersRouter } from '../trpc/routers/providers'
import { OAuthService } from '../auth/oauth-service'
import type { SecureStorage } from '../auth/secure-storage'

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
})
