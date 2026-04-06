import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ProviderConnectionRecord } from '../../../../shared/provider-auth'

const { storeGetQueryMock, storeWatchSubscribeMock } = vi.hoisted(() => ({
  storeGetQueryMock: vi.fn(),
  storeWatchSubscribeMock: vi.fn()
}))

vi.mock('../../trpc/client', () => ({
  trpcClient: {
    store: {
      get: {
        query: storeGetQueryMock
      },
      set: {
        mutate: vi.fn()
      },
      watch: {
        subscribe: storeWatchSubscribeMock
      }
    }
  }
}))

describe('providerStore', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('normalizes legacy flat provider-record maps into structured settings', async () => {
    const legacyProviders = {
      openai: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'token' }
      }
    } satisfies Record<string, ProviderConnectionRecord | undefined>

    storeGetQueryMock.mockResolvedValueOnce(legacyProviders)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data).toEqual({
      providers: legacyProviders,
      providerSettings: {},
      activeProviders: {}
    })
  })

  test('preserves structured settings and backfills missing activeProviders as empty object', async () => {
    const rawStructured = {
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-token' }
        }
      }
    }

    storeGetQueryMock.mockResolvedValueOnce(rawStructured)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data).toEqual({
      providers: rawStructured.providers,
      providerSettings: {},
      activeProviders: {}
    })
  })

  test('preserves structured settings and backfills missing providerSettings as empty object', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      activeProviders: {
        llm: 'openai'
      }
    })
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {},
      activeProviders: {
        llm: 'openai'
      }
    })
  })

  test('migrates providerModels into providerSettings on hydrate', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      providers: {
        openrouter: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'or-key' }
        }
      },
      providerModels: {
        openrouter: { model: 'openai/gpt-4.1-mini' }
      },
      activeProviders: {
        llm: 'openrouter'
      },
      activeModels: {
        llm: 'openai/gpt-4.1-mini'
      }
    })
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data).toEqual({
      providers: {
        openrouter: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'or-key' }
        }
      },
      providerSettings: {
        openrouter: { model: 'openai/gpt-4.1-mini' }
      },
      activeProviders: {
        llm: 'openrouter'
      }
    })
  })

  test('prunes invalid and orphaned provider settings during normalization', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' },
        orphaned: { model: 'gpt-5.2' },
        empty: { model: '   ' },
        malformed: { model: 42 }
      },
      activeProviders: {
        llm: 'openai'
      }
    })
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })
  })

  test('removes stale active provider ids that are no longer present', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        },
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-token' }
        }
      },
      activeProviders: {
        llm: 'missing-provider',
        asr: 'deepgram'
      }
    })
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data.activeProviders).toEqual({
      asr: 'deepgram'
    })
  })

  test('normalizes store.watch updates with stale active providers removed', async () => {
    const watchCallbacks: Array<(newValue: unknown) => void> = []

    storeGetQueryMock.mockResolvedValueOnce(null)
    storeWatchSubscribeMock.mockImplementation((_input, handlers) => {
      watchCallbacks.push(handlers.onData)
      return { unsubscribe: vi.fn() }
    })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    watchCallbacks[0]?.({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      activeProviders: {
        llm: 'does-not-exist'
      }
    })

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {},
      activeProviders: {}
    })
  })

  test('normalizes store.watch updates by migrating legacy providerModels into providerSettings', async () => {
    const watchCallbacks: Array<(newValue: unknown) => void> = []

    storeGetQueryMock.mockResolvedValueOnce(null)
    storeWatchSubscribeMock.mockImplementation((_input, handlers) => {
      watchCallbacks.push(handlers.onData)
      return { unsubscribe: vi.fn() }
    })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    watchCallbacks[0]?.({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerModels: {
        openai: { model: 'gpt-5.2-codex' },
        orphaned: { model: 'gpt-5.2' },
        malformed: { model: 42 }
      },
      activeProviders: {
        llm: 'missing-provider'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
      }
    })

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {}
    })
  })

  test('update performs nested merge for providers and activeProviders', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    const watchCallbacks: Array<(newValue: unknown) => void> = []

    storeGetQueryMock.mockResolvedValueOnce(null)
    storeWatchSubscribeMock.mockImplementation((_input, handlers) => {
      watchCallbacks.push(handlers.onData)
      return { unsubscribe: vi.fn() }
    })

    const { trpcClient } = await import('../../trpc/client')
    vi.mocked(trpcClient.store.set.mutate).mockImplementation(mutateMock)

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().replace({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {},
      activeProviders: {
        llm: 'openai'
      }
    })

    await providerStore.getState().update({
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-token' }
        }
      },
      activeProviders: {
        asr: 'deepgram'
      }
    })

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        },
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-token' }
        }
      },
      activeProviders: {
        llm: 'openai',
        asr: 'deepgram'
      },
      providerSettings: {}
    })
    expect(mutateMock).toHaveBeenCalledWith({
      key: 'providers',
      value: {
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'token' }
          },
          deepgram: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'dg-token' }
          }
        },
        activeProviders: {
          llm: 'openai',
          asr: 'deepgram'
        },
        providerSettings: {}
      }
    })

    void watchCallbacks
  })

  test('update preserves existing providerSettings when merging provider and active provider changes', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    const watchCallbacks: Array<(newValue: unknown) => void> = []

    storeGetQueryMock.mockResolvedValueOnce(null)
    storeWatchSubscribeMock.mockImplementation((_input, handlers) => {
      watchCallbacks.push(handlers.onData)
      return { unsubscribe: vi.fn() }
    })

    const { trpcClient } = await import('../../trpc/client')
    vi.mocked(trpcClient.store.set.mutate).mockImplementation(mutateMock)

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().replace({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })

    await providerStore.getState().update({
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-token' }
        }
      },
      activeProviders: {
        asr: 'deepgram'
      }
    })

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        },
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai',
        asr: 'deepgram'
      }
    })
    expect(mutateMock).toHaveBeenCalledWith({
      key: 'providers',
      value: {
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'token' }
          },
          deepgram: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'dg-token' }
          }
        },
        providerSettings: {
          openai: { model: 'gpt-5.2-codex' }
        },
        activeProviders: {
          llm: 'openai',
          asr: 'deepgram'
        }
      }
    })

    void watchCallbacks
  })

  test('update nested-merges providerSettings per provider id', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    const watchCallbacks: Array<(newValue: unknown) => void> = []

    storeGetQueryMock.mockResolvedValueOnce(null)
    storeWatchSubscribeMock.mockImplementation((_input, handlers) => {
      watchCallbacks.push(handlers.onData)
      return { unsubscribe: vi.fn() }
    })

    const { trpcClient } = await import('../../trpc/client')
    vi.mocked(trpcClient.store.set.mutate).mockImplementation(mutateMock)

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().replace({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex', baseUrl: 'https://example.invalid' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })

    await providerStore.getState().update({
      providerSettings: {
        openai: { model: 'gpt-5.2' }
      }
    })

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2', baseUrl: 'https://example.invalid' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })
    expect(mutateMock).toHaveBeenCalledWith({
      key: 'providers',
      value: {
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'token' }
          }
        },
        providerSettings: {
          openai: { model: 'gpt-5.2', baseUrl: 'https://example.invalid' }
        },
        activeProviders: {
          llm: 'openai'
        }
      }
    })

    void watchCallbacks
  })

  test('update does not drop providerSettings when activeProviders.llm changes', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    const watchCallbacks: Array<(newValue: unknown) => void> = []

    storeGetQueryMock.mockResolvedValueOnce(null)
    storeWatchSubscribeMock.mockImplementation((_input, handlers) => {
      watchCallbacks.push(handlers.onData)
      return { unsubscribe: vi.fn() }
    })

    const { trpcClient } = await import('../../trpc/client')
    vi.mocked(trpcClient.store.set.mutate).mockImplementation(mutateMock)

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().replace({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        },
        custom: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'custom-token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' },
        custom: { model: 'gpt-custom-1' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })

    await providerStore.getState().update({
      activeProviders: {
        llm: 'custom'
      }
    })

    expect(providerStore.getState().data).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        },
        custom: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'custom-token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-5.2-codex' },
        custom: { model: 'gpt-custom-1' }
      },
      activeProviders: {
        llm: 'custom'
      }
    })
    expect(mutateMock).toHaveBeenCalledWith({
      key: 'providers',
      value: {
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'token' }
          },
          custom: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'custom-token' }
          }
        },
        providerSettings: {
          openai: { model: 'gpt-5.2-codex' },
          custom: { model: 'gpt-custom-1' }
        },
        activeProviders: {
          llm: 'custom'
        }
      }
    })

    void watchCallbacks
  })
})
