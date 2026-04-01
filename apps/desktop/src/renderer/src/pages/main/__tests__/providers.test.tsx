// @vitest-environment jsdom

import React from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'
import type { ProviderConnectionType } from '@openbroca/providers'
import type {
  ProviderAuthState,
  ProviderConnectionRecord,
  ProviderSettings
} from '../../../../../shared/provider-auth'

type ProviderStoreShape = {
  data: ProviderSettings
  isHydrated: boolean
  update: ReturnType<typeof vi.fn>
  replace: ReturnType<typeof vi.fn>
  hydrate: ReturnType<typeof vi.fn>
}

type ProviderViewModel = {
  id: string
  displayName: string
  description?: string
  connectionOptions: Array<{
    type: ProviderConnectionType
    label: string
  }>
}

const providerStore = createStore<ProviderStoreShape>(() => ({
  data: {
    providers: {},
    activeProviders: {}
  },
  isHydrated: true,
  update: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  hydrate: vi.fn().mockResolvedValue(undefined)
}))

const upsertProviderConnection = vi.fn<
  (providerId: string, connection: ProviderConnectionRecord) => Promise<void>
>().mockResolvedValue(undefined)
const removeProviderConnection = vi.fn<(providerId: string) => Promise<void>>().mockResolvedValue(undefined)

let llmProviders: ProviderViewModel[] = []
let asrProviders: ProviderViewModel[] = []
let providerAuthStatus: Record<string, ProviderAuthState> = {}
const connectProviderAuth = vi.fn<(providerId: string) => Promise<ProviderAuthState>>()
const disconnectProviderAuth = vi.fn<(providerId: string) => Promise<ProviderAuthState>>()
const setProviderAuthStatus = vi.fn((input: { providerId: string }, status: ProviderAuthState) => {
  providerAuthStatus[input.providerId] = status
})

vi.mock(
  '@renderer/stores/provider-store',
  () => ({
    providerStore,
    upsertProviderConnection,
    removeProviderConnection
  })
)

vi.mock(
  '@renderer/trpc',
  () => ({
    trpc: {
      useUtils: () => ({
        providerAuth: {
          status: {
            setData: setProviderAuthStatus
          }
        }
      }),
      providers: {
        listLLM: {
          useQuery: () => ({ data: llmProviders })
        },
        listASR: {
          useQuery: () => ({ data: asrProviders })
        }
      },
      providerAuth: {
        status: {
          useQuery: ({ providerId }: { providerId: string }) => ({
            data: providerAuthStatus[providerId] ?? { providerId, status: 'not-connected' }
          })
        }
      }
    }
  })
)

vi.mock(
  '@renderer/components/providers/provider-types',
  () => ({
    toProviderViewModel: (provider: ProviderViewModel) => provider
  })
)

vi.mock(
  '@renderer/components/providers/provider-section',
  () => ({
    ProviderSection: ({
      providers,
      settings,
      onConnect,
      onDisconnect
    }: {
      providers: ProviderViewModel[]
      settings: Record<string, ProviderConnectionRecord | undefined>
      onConnect: (provider: ProviderViewModel) => void
      onDisconnect: (providerId: string, connectionType: ProviderConnectionType) => void
    }) => (
      <div>
        {providers.map((provider) => {
          const setting = settings[provider.id]
          if (setting) {
            return (
              <button
                key={`disconnect-${provider.id}`}
                onClick={() => onDisconnect(provider.id, setting.connectionType)}
              >
                Disconnect {provider.id}
              </button>
            )
          }

          return (
            <button key={`connect-${provider.id}`} onClick={() => onConnect(provider)}>
              Connect {provider.id}
            </button>
          )
        })}
      </div>
    )
  })
)

vi.mock(
  '@renderer/components/providers/provider-connect-dialog',
  () => ({
    ProviderConnectDialog: ({
      provider,
      open,
      onSave,
      onOAuthConnect
    }: {
      provider: ProviderViewModel | null
      open: boolean
      onSave: (
        providerId: string,
        connectionType: Extract<ProviderConnectionType, 'apiKey' | 'local'>,
        config?: Record<string, string>
      ) => Promise<void>
      onOAuthConnect: (providerId: string) => Promise<void>
    }) => {
      if (!open || !provider) return null

      return (
        <div data-testid="dialog-root">
          <button onClick={() => onSave(provider.id, 'apiKey', { apiKey: 'sk-test' })}>Save Connection</button>
          <button onClick={() => onOAuthConnect(provider.id)}>Continue in browser</button>
        </div>
      )
    }
  })
)

vi.mock('@openbroca/ui', () => ({
  Separator: () => <hr />,
  TypographyH3: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  TypographyMuted: ({ children }: { children: React.ReactNode }) => <p>{children}</p>
}))

async function renderProviders() {
  const { Providers } = await import('../providers')
  return render(<Providers />)
}

describe('Providers page', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    llmProviders = []
    asrProviders = []
    providerAuthStatus = {}
    connectProviderAuth.mockReset()
    disconnectProviderAuth.mockReset()
    setProviderAuthStatus.mockClear()
    upsertProviderConnection.mockClear()
    removeProviderConnection.mockClear()
    window.api = {
      providerAuth: {
        connect: connectProviderAuth,
        disconnect: disconnectProviderAuth
      }
    } as unknown as Window['api']
    providerStore.setState({
      data: {
        providers: {},
        activeProviders: {}
      },
      isHydrated: true,
      update: vi.fn().mockResolvedValue(undefined),
      replace: vi.fn().mockResolvedValue(undefined),
      hydrate: vi.fn().mockResolvedValue(undefined)
    })
  })

  test('saves manual provider connection through upsert helper', async () => {
    llmProviders = [
      {
        id: 'openai',
        displayName: 'OpenAI',
        description: 'GPT models',
        connectionOptions: [{ type: 'apiKey', label: 'API Key' }]
      }
    ]

    await renderProviders()

    fireEvent.click(screen.getByRole('button', { name: 'Connect openai' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(upsertProviderConnection).toHaveBeenCalledWith('openai', {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'sk-test' }
      })
    })
  })

  test('disconnects manual provider connection through remove helper', async () => {
    llmProviders = [
      {
        id: 'openai',
        displayName: 'OpenAI',
        description: 'GPT models',
        connectionOptions: [{ type: 'apiKey', label: 'API Key' }]
      }
    ]

    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-openai' }
          }
        },
        activeProviders: {}
      }
    })

    await renderProviders()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect openai' }))

    await waitFor(() => {
      expect(removeProviderConnection).toHaveBeenCalledWith('openai')
    })
  })

  test('uses OAuth bridge connect/disconnect for oauth providers', async () => {
    llmProviders = [
      {
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        description: 'OAuth-only',
        connectionOptions: [{ type: 'oauth', label: 'OpenAI Account' }]
      }
    ]

    connectProviderAuth.mockResolvedValue({
      providerId: 'openai-codex',
      status: 'connected',
      lastConnectedAt: '2026-03-28T12:00:00.000Z'
    })
    disconnectProviderAuth.mockResolvedValue({
      providerId: 'openai-codex',
      status: 'not-connected'
    })

    await renderProviders()
    fireEvent.click(screen.getByRole('button', { name: 'Connect openai-codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))

    await waitFor(() => {
      expect(connectProviderAuth).toHaveBeenCalledWith('openai-codex')
    })

    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          'openai-codex': {
            enabled: true,
            connectionType: 'oauth'
          }
        },
        activeProviders: {}
      }
    })

    const disconnectButton = await waitFor(() =>
      screen.getByRole('button', { name: 'Disconnect openai-codex' })
    )
    fireEvent.click(disconnectButton)
    await waitFor(() => {
      expect(disconnectProviderAuth).toHaveBeenCalledWith('openai-codex')
    })
  })
})
