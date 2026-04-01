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
        connectionType: 'api-key',
        config: { apiKey: 'token' }
      }
    } satisfies Record<string, ProviderConnectionRecord | undefined>

    storeGetQueryMock.mockResolvedValueOnce(legacyProviders)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { providerStore } = await import('../provider-store')
    await providerStore.getState().hydrate()

    expect(providerStore.getState().data).toEqual({
      providers: legacyProviders,
      activeProviders: {}
    })
  })

  test('preserves structured settings and backfills missing activeProviders as empty object', async () => {
    const rawStructured = {
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
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
      activeProviders: {}
    })
  })

  test('removes stale active provider ids that are no longer present', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'api-key',
          config: { apiKey: 'token' }
        },
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
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
})
