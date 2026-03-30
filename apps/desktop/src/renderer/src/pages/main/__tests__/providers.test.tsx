// @vitest-environment jsdom

import React from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'
import type { ProviderAuthState } from '../../../../../shared/provider-auth'

type ProviderStoreShape = {
  data: Record<string, unknown>
  isHydrated: boolean
  update: ReturnType<typeof vi.fn>
  replace: ReturnType<typeof vi.fn>
  hydrate: ReturnType<typeof vi.fn>
}

const providerStore = createStore<ProviderStoreShape>(() => ({
  data: {},
  isHydrated: true,
  update: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  hydrate: vi.fn().mockResolvedValue(undefined)
}))

let llmProviders: any[] = []
let asrProviders: any[] = []
let providerAuthStatus: Record<string, ProviderAuthState> = {}
const connectProviderAuth = vi.fn<(providerId: string) => Promise<ProviderAuthState>>()
const disconnectProviderAuth = vi.fn<(providerId: string) => Promise<ProviderAuthState>>()
const setProviderAuthStatus = vi.fn((input: { providerId: string }, status: ProviderAuthState) => {
  providerAuthStatus[input.providerId] = status
})

vi.mock('@renderer/stores/provider-store', () => ({
  providerStore
}))

vi.mock('@renderer/trpc', () => ({
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
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => null
}))

vi.mock('@openbroca/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    type = 'button',
    disabled
  }: {
    children: React.ReactNode
    onClick?: () => void
    type?: 'button' | 'submit'
    disabled?: boolean
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Input: ({ value, onChange, ...props }: React.ComponentProps<'input'>) => (
    <input value={value} onChange={onChange} {...props} />
  ),
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Separator: () => <hr />,
  TypographyH3: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  TypographyLarge: ({ children }: { children: React.ReactNode }) => <h4>{children}</h4>,
  TypographyMuted: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  TypographySmall: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}))

async function renderProviders() {
  const { Providers } = await import('../providers')
  return render(<Providers />)
}

describe('Providers page', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()
    llmProviders = []
    asrProviders = []
    providerAuthStatus = {}
    connectProviderAuth.mockReset()
    disconnectProviderAuth.mockReset()
    setProviderAuthStatus.mockClear()
    window.api = {
      providerAuth: {
        connect: connectProviderAuth,
        disconnect: disconnectProviderAuth
      }
    } as unknown as Window['api']
    providerStore.setState({
      data: {},
      isHydrated: true,
      update: vi.fn().mockResolvedValue(undefined),
      replace: vi.fn().mockResolvedValue(undefined),
      hydrate: vi.fn().mockResolvedValue(undefined)
    })
  })

  test('shows provider-specific API key fields and persists them on connect', async () => {
    llmProviders = [
      {
        id: 'openai',
        displayName: 'OpenAI',
        description: 'GPT models',
        icon: null,
        connectionOptions: [
          {
            type: 'apiKey',
            label: 'API Key',
            fields: [
              { key: 'apiKey', label: 'API Key', input: 'password', required: true },
              { key: 'baseUrl', label: 'Base URL', input: 'url' },
              { key: 'organization', label: 'Organization', input: 'text' }
            ]
          }
        ]
      }
    ]

    await renderProviders()

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(screen.getByTestId('dialog-root')).toBeTruthy()
    expect(screen.getByLabelText('API Key')).toBeTruthy()
    expect(screen.getByLabelText('Base URL')).toBeTruthy()
    expect(screen.getByLabelText('Organization')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } })
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://example.com/v1' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Connection' }))

    await waitFor(() => {
      expect(providerStore.getState().update).toHaveBeenCalledWith({
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: {
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1'
          }
        }
      })
    })
  })

  test('keeps API key providers connected when a provider also supports OAuth', async () => {
    llmProviders = [
      {
        id: 'acme',
        displayName: 'Acme AI',
        description: 'OAuth or API key',
        icon: null,
        connectionOptions: [
          {
            type: 'oauth',
            label: 'Workspace OAuth',
            description: 'Connect your workspace',
            buttonLabel: 'Continue in browser',
            flow: 'systemBrowser'
          },
          {
            type: 'apiKey',
            label: 'API Key',
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      }
    ]

    providerStore.setState({
      ...providerStore.getState(),
      data: {
        acme: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'sk-acme' }
        }
      }
    })

    await renderProviders()

    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect(screen.queryByText('Connected')).toBeNull()
  })

  test('shows OAuth browser auth UI and connects openai-codex without exposing tokens', async () => {
    llmProviders = [
      {
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        description: 'Connect with OAuth',
        icon: null,
        connectionOptions: [
          {
            type: 'oauth',
            label: 'OpenAI Account',
            description: 'Sign in with your ChatGPT account to connect OpenAI Codex.',
            buttonLabel: 'Continue in browser',
            flow: 'systemBrowser'
          }
        ]
      }
    ]

    connectProviderAuth.mockResolvedValue({
      providerId: 'openai-codex',
      status: 'connected',
      lastConnectedAt: '2026-03-28T12:00:00.000Z'
    })

    await renderProviders()

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(screen.getByText('Sign in with your ChatGPT account to connect OpenAI Codex.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue in browser' })).toBeTruthy()
    expect(screen.queryByText(/accessToken/i)).toBeNull()
    expect(screen.queryByText(/refreshToken/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))

    await waitFor(() => {
      expect(connectProviderAuth).toHaveBeenCalledWith('openai-codex')
    })
  })

  test('reflects OAuth connected status without exposing tokens and disconnects via preload bridge', async () => {
    llmProviders = [
      {
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        description: 'OAuth-only',
        icon: null,
        connectionOptions: [
          {
            type: 'oauth',
            label: 'OpenAI Account',
            description: 'Sign in with your ChatGPT account to connect OpenAI Codex.',
            buttonLabel: 'Continue in browser',
            flow: 'systemBrowser'
          }
        ]
      }
    ]

    providerAuthStatus['openai-codex'] = {
      providerId: 'openai-codex',
      status: 'connected',
      lastConnectedAt: '2026-03-28T12:00:00.000Z'
    }
    disconnectProviderAuth.mockResolvedValue({
      providerId: 'openai-codex',
      status: 'not-connected'
    })

    await renderProviders()

    expect(screen.getByText('OAuth')).toBeTruthy()
    expect(screen.getByText('openai-codex')).toBeTruthy()
    expect(screen.queryByText(/accessToken/i)).toBeNull()
    expect(screen.queryByText(/refreshToken/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(disconnectProviderAuth).toHaveBeenCalledWith('openai-codex')
    })
  })

  test('constrains and centers the page content', async () => {
    const { container } = await renderProviders()

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })
})
