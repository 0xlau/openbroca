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
      providerModels: {},
      activeProviders: {},
      activeModels: {}
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
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })
  })

  test('preserves structured settings and backfills missing model state as empty objects', async () => {
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
      providerModels: {},
      activeProviders: {
        llm: 'openai'
      },
      activeModels: {}
    })
  })

  test('prunes invalid and orphaned provider model selections during normalization', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
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
        empty: { model: '   ' },
        malformed: { model: 42 }
      },
      activeProviders: {
        llm: 'openai'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
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
      providerModels: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
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
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })
  })

  test('normalizes store.watch updates by pruning malformed and orphaned model state', async () => {
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
      providerModels: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {},
      activeModels: {}
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
      providerModels: {},
      activeProviders: {
        llm: 'openai'
      },
      activeModels: {}
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
      providerModels: {},
      activeModels: {}
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
        providerModels: {},
        activeModels: {}
      }
    })

    void watchCallbacks
  })

  test('update preserves existing model state when merging provider and active provider changes', async () => {
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
      providerModels: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
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
      providerModels: {
        openai: { model: 'gpt-5.2-codex' }
      },
      activeProviders: {
        llm: 'openai',
        asr: 'deepgram'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
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
        providerModels: {
          openai: { model: 'gpt-5.2-codex' }
        },
        activeProviders: {
          llm: 'openai',
          asr: 'deepgram'
        },
        activeModels: {
          llm: 'gpt-5.2-codex'
        }
      }
    })

    void watchCallbacks
  })

  test('update clears activeModels.llm when activeProviders.llm changes without a replacement active model', async () => {
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
      providerModels: {
        openai: { model: 'gpt-5.2-codex' },
        custom: { model: 'gpt-custom-1' }
      },
      activeProviders: {
        llm: 'openai'
      },
      activeModels: {
        llm: 'gpt-5.2-codex'
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
      providerModels: {
        openai: { model: 'gpt-5.2-codex' },
        custom: { model: 'gpt-custom-1' }
      },
      activeProviders: {
        llm: 'custom'
      },
      activeModels: {}
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
        providerModels: {
          openai: { model: 'gpt-5.2-codex' },
          custom: { model: 'gpt-custom-1' }
        },
        activeProviders: {
          llm: 'custom'
        },
        activeModels: {}
      }
    })

    void watchCallbacks
  })
})
