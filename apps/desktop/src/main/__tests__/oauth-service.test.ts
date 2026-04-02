import { describe, expect, test, vi } from 'vitest'
import { OAuthService } from '../auth/oauth-service'
import type { OAuthSession } from '../auth/openai-codex-oauth'
import type { SecureStorage } from '../auth/secure-storage'

class MemoryStore {
  private state: Record<string, unknown> = {
    providers: {
      providers: {},
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    }
  }
  private setCalls = 0

  get<T>(key: string): T | undefined {
    return this.state[key] as T | undefined
  }

  set(key: string, value: unknown): void {
    this.setCalls += 1
    this.state[key] = value
  }

  getSetCallCount(): number {
    return this.setCalls
  }
}

describe('OAuthService', () => {
  test('starts browser oauth, handles callback, and persists structured provider settings', async () => {
    const session = {
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-03-28T12:00:00.000Z'
      },
      account: {
        email: 'dev@example.com',
        accountId: 'acct_123'
      }
    } satisfies OAuthSession

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
          authorize: vi.fn(async () => session),
          dispose: vi.fn()
        }
      }
    })

    const result = await oauthService.start('openai-codex')

    expect(result.status).toBe('connected')
    expect(result.account).toEqual(session.account)
    expect(secureStorage.setSecret).toHaveBeenCalledWith(
      'provider:openai-codex',
      expect.stringContaining('"refreshToken"')
    )
    expect(store.get('providers')).toEqual({
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth',
          account: session.account,
          auth: {
            status: 'connected',
            lastConnectedAt: expect.any(String)
          }
        }
      },
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })
    expect(JSON.stringify(store.get('providers'))).not.toContain('access-token')
    expect(JSON.stringify(store.get('providers'))).not.toContain('refresh-token')
  })

  test('disconnect removes the secure token, auth metadata, and active provider selections', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => '{"accessToken":"access-token"}'),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth',
          account: {
            email: 'dev@example.com',
            accountId: 'acct_123'
          },
          auth: {
            status: 'connected',
            lastConnectedAt: '2026-03-28T12:00:00.000Z'
          }
        },
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
          config: {
            apiKey: 'deepgram-key'
          }
        }
      },
      activeProviders: {
        llm: 'openai-codex',
        asr: 'deepgram'
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

    const result = await oauthService.disconnect('openai-codex')

    expect(result).toEqual({
      providerId: 'openai-codex',
      status: 'not-connected'
    })
    expect(secureStorage.deleteSecret).toHaveBeenCalledWith('provider:openai-codex')
    expect(store.get('providers')).toEqual({
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
          config: {
            apiKey: 'deepgram-key'
          }
        }
      },
      providerModels: {},
      activeProviders: {
        asr: 'deepgram'
      },
      activeModels: {}
    })
  })

  test('disconnect clears active llm model and saved provider model for the removed provider', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth',
          account: { accountId: 'acct_codex' },
          auth: {
            status: 'connected',
            lastConnectedAt: '2026-04-02T00:00:00.000Z'
          }
        }
      },
      providerModels: {
        'openai-codex': { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai-codex'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
      }
    })

    const service = new OAuthService({
      secureStorage,
      store,
      providers: {
        'openai-codex': {
          authorize: vi.fn(),
          dispose: vi.fn()
        }
      }
    })

    await service.disconnect('openai-codex')

    expect(store.get('providers')).toEqual({
      providers: {},
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })
  })

  test('getStatus returns not-connected and clears stale store metadata when secret is missing', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth',
          account: {
            email: 'dev@example.com',
            accountId: 'acct_123'
          },
          auth: {
            status: 'connected',
            lastConnectedAt: '2026-03-28T12:00:00.000Z'
          }
        }
      },
      activeProviders: {}
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

    const result = await oauthService.getStatus('openai-codex')

    expect(secureStorage.getSecret).toHaveBeenCalledWith('provider:openai-codex')
    expect(result).toEqual({
      providerId: 'openai-codex',
      status: 'not-connected'
    })
    expect(store.get('providers')).toEqual({
      providers: {},
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })
  })

  test('disconnect does not rewrite store when no provider record or active selection exists', async () => {
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

    const result = await oauthService.disconnect('openai-codex')

    expect(result).toEqual({
      providerId: 'openai-codex',
      status: 'not-connected'
    })
    expect(secureStorage.deleteSecret).toHaveBeenCalledWith('provider:openai-codex')
    expect(store.getSetCallCount()).toBe(0)
  })

  test('disconnect rewrites store to clear stale model-only state without provider records', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      providers: {},
      providerModels: {
        'openai-codex': { model: 'gpt-5.2-codex' }
      },
      activeProviders: {},
      activeModels: {
        llm: 'gpt-5.2-codex'
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

    const result = await oauthService.disconnect('openai-codex')

    expect(result).toEqual({
      providerId: 'openai-codex',
      status: 'not-connected'
    })
    expect(store.get('providers')).toEqual({
      providers: {},
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })
    expect(store.getSetCallCount()).toBe(2)
  })

  test('disconnect does not rewrite store when unrelated provider model state remains valid', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
          config: {
            apiKey: 'deepgram-key'
          }
        }
      },
      providerModels: {
        deepgram: { model: 'nova-3' }
      },
      activeProviders: {
        llm: 'deepgram'
      },
      activeModels: {
        llm: 'nova-3'
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

    const result = await oauthService.disconnect('openai-codex')

    expect(result).toEqual({
      providerId: 'openai-codex',
      status: 'not-connected'
    })
    expect(store.get('providers')).toEqual({
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
          config: {
            apiKey: 'deepgram-key'
          }
        }
      },
      providerModels: {
        deepgram: { model: 'nova-3' }
      },
      activeProviders: {
        llm: 'deepgram'
      },
      activeModels: {
        llm: 'nova-3'
      }
    })
    expect(store.getSetCallCount()).toBe(1)
  })
})
