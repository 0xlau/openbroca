// @vitest-environment jsdom

import React from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

type ProviderFixture = {
  id: string
  displayName: string
  description: string
  icon: null
  settingsItems?: Array<
    | {
        key: string
        type: 'model-select'
        label: string
        description?: string
        required?: boolean
        dataSource: 'llm-models'
      }
    | {
        key: string
        type: 'select'
        label: string
        description?: string
        required?: boolean
        options: Array<{ label: string; value: string }>
      }
  >
  connectionOptions: Array<{
    type: ProviderConnectionType
    label: string
    description?: string
    buttonLabel?: string
    flow?: 'systemBrowser'
    fields?: Array<{
      key: string
      label: string
      input: 'password' | 'url' | 'text'
      required?: boolean
    }>
  }>
}

type ProviderSetupStatusFixture = {
  status: 'not-connected' | 'configured' | 'invalid' | 'ready'
  canActivate: boolean
  summary?: string
  blockingReasons: string[]
  fieldErrors?: Record<string, string>
}

type ProviderSetupStatusQueryFixture = {
  data?: ProviderSetupStatusFixture
  isLoading?: boolean
}

const openAIProviderFixture: ProviderFixture = {
  id: 'openai',
  displayName: 'OpenAI',
  description: 'GPT models',
  icon: null,
  settingsItems: [
    {
      key: 'model',
      type: 'model-select',
      label: 'Model',
      description: 'Choose a model',
      required: true,
      dataSource: 'llm-models'
    }
  ],
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
    }
  ]
}

const deepgramProviderFixture: ProviderFixture = {
  id: 'deepgram',
  displayName: 'Deepgram',
  description: 'Speech to text',
  icon: null,
  settingsItems: [
    {
      key: 'language',
      type: 'select',
      label: 'Language',
      description: 'Choose a default language',
      options: [
        { label: 'English (en)', value: 'en' },
        { label: 'Chinese (zh)', value: 'zh' }
      ]
    }
  ],
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
    }
  ]
}

const providerStore = createStore<ProviderStoreShape>(() => ({
  data: {
    providers: {},
    providerSettings: {},
    activeProviders: {}
  },
  isHydrated: true,
  update: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  hydrate: vi.fn().mockResolvedValue(undefined)
}))

const upsertProviderConnection = vi
  .fn<(providerId: string, connection: ProviderConnectionRecord) => Promise<void>>()
  .mockResolvedValue(undefined)

let llmProviders: ProviderFixture[] = []
let asrProviders: ProviderFixture[] = []
let llmModelsByProvider: Record<string, Array<{ id: string; name: string }>> = {}
let providerSetupStatusQueries: Record<string, ProviderSetupStatusQueryFixture> = {}
let providerAuthStatus: Record<string, ProviderAuthState> = {}
const connectProviderAuth = vi.fn<(providerId: string) => Promise<ProviderAuthState>>()
const disconnectProviderAuth = vi.fn<(providerId: string) => Promise<ProviderAuthState>>()
const setProviderAuthStatus = vi.fn((input: { providerId: string }, status: ProviderAuthState) => {
  providerAuthStatus[input.providerId] = status
})

const TooltipContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
} | null>(null)
const SelectContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  value?: string
  setValue: (value: string) => void
} | null>(null)

vi.mock('@renderer/stores/provider-store', () => ({
  providerStore,
  upsertProviderConnection
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
      getSetupStatus: {
        useQuery: ({ providerId, kind }: { providerId: string; kind: 'llm' | 'asr' }) => {
          const query = providerSetupStatusQueries[`${kind}:${providerId}`]
          return {
            data: query?.data,
            isLoading: query?.isLoading ?? false,
            error: null
          }
        }
      },
      listModels: {
        useQuery: (
          { providerId }: { providerId: string },
          options?: { enabled?: boolean }
        ) => ({
          data: options?.enabled === false ? undefined : (llmModelsByProvider[providerId] ?? []),
          isLoading: false,
          error: null
        })
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
    disabled,
    ...props
  }: React.ComponentProps<'button'>) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
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
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children
  }: {
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => {
    const [open, setOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const selectedValue = value ?? internalValue

    const setValue = (nextValue: string) => {
      if (value === undefined) {
        setInternalValue(nextValue)
      }
      onValueChange?.(nextValue)
    }

    return (
      <SelectContext.Provider value={{ open, setOpen, value: selectedValue, setValue }}>
        {children}
      </SelectContext.Provider>
    )
  },
  SelectTrigger: ({
    children,
    ...props
  }: React.ComponentProps<'button'>) => {
    const context = React.useContext(SelectContext)
    return (
      <button
        type="button"
        role="combobox"
        aria-expanded={context?.open ?? false}
        onClick={() => context?.setOpen((current) => !current)}
        {...props}
      >
        {children}
      </button>
    )
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    const context = React.useContext(SelectContext)
    return <span>{context?.value ?? placeholder}</span>
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => {
    const context = React.useContext(SelectContext)
    return context?.open ? <div>{children}</div> : null
  },
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
    const context = React.useContext(SelectContext)
    return (
      <button
        type="button"
        onClick={() => {
          context?.setValue(value)
          context?.setOpen(false)
        }}
      >
        {children}
      </button>
    )
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false)
    return <TooltipContext.Provider value={{ open, setOpen }}>{children}</TooltipContext.Provider>
  },
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    void asChild
    const context = React.useContext(TooltipContext)
    const child = children as React.ReactElement<{
      onMouseEnter?: () => void
      onMouseLeave?: () => void
    }>
    return React.cloneElement(child, {
      onMouseEnter: () => context?.setOpen(true),
      onMouseLeave: () => context?.setOpen(false)
    })
  },
  TooltipContent: ({ children }: { children: React.ReactNode }) => {
    const context = React.useContext(TooltipContext)
    return context?.open ? <div role="tooltip">{children}</div> : null
  },
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
    llmModelsByProvider = {}
    providerSetupStatusQueries = {}
    providerAuthStatus = {}
    connectProviderAuth.mockReset()
    disconnectProviderAuth.mockReset()
    setProviderAuthStatus.mockClear()
    upsertProviderConnection.mockClear()
    window.api = {
      providerAuth: {
        connect: connectProviderAuth,
        disconnect: disconnectProviderAuth
      }
    } as unknown as Window['api']
    providerStore.setState({
      data: {
        providers: {},
        providerSettings: {},
        activeProviders: {}
      },
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
      expect(upsertProviderConnection).toHaveBeenCalledWith('openai', {
        enabled: true,
        connectionType: 'apiKey',
        config: {
          apiKey: 'sk-test',
          baseUrl: 'https://example.com/v1'
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
        providers: {
          acme: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-acme' }
          }
        },
        providerSettings: {},
        activeProviders: {}
      }
    })

    await renderProviders()

    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect(screen.queryByText('Disconnect')).toBeNull()
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

  test('shows Set as active for connected inactive LLM providers and writes activeProviders.llm', async () => {
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
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      }
    ]
    providerSetupStatusQueries['llm:openai'] = {
      data: {
        status: 'ready',
        canActivate: true,
        summary: 'Ready to use.',
        blockingReasons: []
      }
    }

    const connectedOpenAI: ProviderConnectionRecord = {
      enabled: true,
      connectionType: 'apiKey',
      config: { apiKey: 'sk-openai' }
    }
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          openai: connectedOpenAI
        },
        providerSettings: {
          openai: { model: 'gpt-4.1-mini' }
        },
        activeProviders: {
          asr: 'deepgram'
        }
      },
      update: updateSettings
    })

    await renderProviders()

    expect(screen.getByRole('button', { name: 'Set as active' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Set as active' }))

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        activeProviders: {
          llm: 'openai'
        }
      })
    })
  })

  test('disables Set as active when setup status cannot activate', async () => {
    llmProviders = [openAIProviderFixture]
    providerSetupStatusQueries['llm:openai'] = {
      data: {
        status: 'configured',
        canActivate: false,
        summary: 'Select a model to finish setup.',
        blockingReasons: ['Choose a model'],
        fieldErrors: { model: 'Choose a model' }
      }
    }

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
        providerSettings: {},
        activeProviders: {}
      }
    })

    await renderProviders()

    expect(screen.getByRole('button', { name: 'Set as active' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Choose a model')).toBeTruthy()
  })

  test('opens the unified settings dialog, shows setup summary, and saves providerSettings for openai', async () => {
    llmProviders = [openAIProviderFixture]
    providerSetupStatusQueries['llm:openai'] = {
      data: {
        status: 'configured',
        canActivate: false,
        summary: 'Select a model to finish setup.',
        blockingReasons: ['Choose a model'],
        fieldErrors: { model: 'Choose a model' }
      }
    }
    llmModelsByProvider.openai = [
      { id: 'gpt-4.1', name: 'gpt-4.1' },
      { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' }
    ]

    const updateSettings = vi.fn().mockResolvedValue(undefined)
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
        providerSettings: {},
        activeProviders: {}
      },
      update: updateSettings
    })

    await renderProviders()
    expect(screen.queryByRole('button', { name: 'Open model settings for OpenAI' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open settings for OpenAI' }))

    expect(screen.getByRole('heading', { name: 'Settings for OpenAI' })).toBeTruthy()
    expect(screen.getByText('Select a model to finish setup.')).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('gpt-4.1'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        providerSettings: {
          openai: { model: 'gpt-4.1' }
        }
      })
    })

    expect(updateSettings.mock.calls[0]?.[0]).not.toHaveProperty('providerModels')
  })

  test('shows a unified settings button for connected ASR providers with settings items', async () => {
    asrProviders = [deepgramProviderFixture]
    providerSetupStatusQueries['asr:deepgram'] = {
      data: {
        status: 'ready',
        canActivate: true,
        summary: 'Ready to use.',
        blockingReasons: []
      }
    }
    const updateSettings = vi.fn().mockResolvedValue(undefined)

    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          deepgram: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'dg-secret' }
          }
        },
        providerSettings: {},
        activeProviders: {}
      },
      update: updateSettings
    })

    await renderProviders()

    expect(screen.queryByRole('button', { name: /open model settings for deepgram/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open settings for Deepgram' }))

    expect(screen.getByRole('heading', { name: 'Settings for Deepgram' })).toBeTruthy()
    expect(screen.getByLabelText('Language')).toBeTruthy()
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Chinese (zh)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        providerSettings: {
          deepgram: { language: 'zh' }
        }
      })
    })
  })

  test('shows Current action for an active llm provider when a saved model exists', async () => {
    llmProviders = [openAIProviderFixture]
    providerSetupStatusQueries['llm:openai'] = {
      data: {
        status: 'ready',
        canActivate: true,
        summary: 'Ready to use.',
        blockingReasons: []
      }
    }
    llmModelsByProvider.openai = [
      { id: 'gpt-4.1', name: 'gpt-4.1' },
      { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' }
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
        providerSettings: {
          openai: { model: 'gpt-4.1' }
        },
        activeProviders: {
          llm: 'openai'
        }
      }
    })

    await renderProviders()

    expect(screen.queryByRole('button', { name: 'Apply saved model' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Current' })).toBeTruthy()
  })

  test('shows Current action for an active llm provider with a saved model', async () => {
    providerSetupStatusQueries['llm:openai'] = {
      data: {
        status: 'ready',
        canActivate: true,
        summary: 'Ready to use.',
        blockingReasons: []
      }
    }
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
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
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
        providerSettings: {
          openai: { model: 'gpt-4.1-mini' }
        },
        activeProviders: {
          llm: 'openai'
        }
      }
    })

    await renderProviders()

    expect(screen.getByRole('button', { name: 'Current' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set as active' })).toBeNull()
  })

  test('disables Set as active when an llm provider is selected as active but has no saved model', async () => {
    llmProviders = [openAIProviderFixture]
    providerSetupStatusQueries['llm:openai'] = {
      data: {
        status: 'configured',
        canActivate: false,
        summary: 'Select a model to finish setup.',
        blockingReasons: ['Choose a model'],
        fieldErrors: { model: 'Choose a model' }
      }
    }

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
        providerSettings: {},
        activeProviders: {
          llm: 'openai'
        }
      }
    })

    await renderProviders()

    expect(screen.queryByRole('button', { name: 'Current' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Set as active' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Choose a model')).toBeTruthy()
  })

  test('disables Set as active while setup status is loading for a connected llm provider', async () => {
    llmProviders = [openAIProviderFixture]
    providerSetupStatusQueries['llm:openai'] = {
      isLoading: true
    }

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
        providerSettings: {
          openai: { model: 'gpt-4.1-mini' }
        },
        activeProviders: {}
      }
    })

    await renderProviders()

    expect(screen.getByRole('button', { name: 'Set as active' })).toHaveProperty('disabled', true)
  })

  test('does not show Current when setup status is missing for an active llm provider', async () => {
    llmProviders = [openAIProviderFixture]

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
        providerSettings: {
          openai: { model: 'gpt-4.1-mini' }
        },
        activeProviders: {
          llm: 'openai'
        }
      }
    })

    await renderProviders()

    expect(screen.queryByRole('button', { name: 'Current' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Set as active' })).toHaveProperty('disabled', true)
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

    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          'openai-codex': {
            enabled: true,
            connectionType: 'oauth'
          }
        },
        providerSettings: {},
        activeProviders: {}
      }
    })
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

  test('oauth disconnect does not issue renderer-side providerStore.update after bridge disconnect resolves', async () => {
    asrProviders = [
      {
        id: 'openai-realtime',
        displayName: 'OpenAI Realtime',
        description: 'Realtime ASR via OAuth',
        icon: null,
        connectionOptions: [
          {
            type: 'oauth',
            label: 'OpenAI Account',
            description: 'Connect your OpenAI account',
            buttonLabel: 'Continue in browser',
            flow: 'systemBrowser'
          }
        ]
      }
    ]
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
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      }
    ]

    providerAuthStatus['openai-realtime'] = {
      providerId: 'openai-realtime',
      status: 'connected',
      lastConnectedAt: '2026-03-28T12:00:00.000Z'
    }
    disconnectProviderAuth.mockResolvedValue({
      providerId: 'openai-realtime',
      status: 'not-connected'
    })

    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const replaceSettings = vi.fn().mockResolvedValue(undefined)
    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          'openai-realtime': {
            enabled: true,
            connectionType: 'oauth'
          },
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-openai' }
          }
        },
        providerSettings: {},
        activeProviders: {
          asr: 'openai-realtime',
          llm: 'openai'
        }
      },
      update: updateSettings,
      replace: replaceSettings
    })

    await renderProviders()

    const asrSection = screen.getByText('ASR Providers').closest('section')
    expect(asrSection).toBeTruthy()
    fireEvent.click(within(asrSection as HTMLElement).getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(disconnectProviderAuth).toHaveBeenCalledWith('openai-realtime')
      expect(updateSettings).not.toHaveBeenCalled()
      expect(replaceSettings).not.toHaveBeenCalled()
    })
  })

  test('disconnecting an active API key LLM provider removes connection and clears only activeProviders.llm', async () => {
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
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      }
    ]
    asrProviders = [
      {
        id: 'deepgram',
        displayName: 'Deepgram',
        description: 'Speech to text',
        icon: null,
        connectionOptions: [
          {
            type: 'apiKey',
            label: 'API Key',
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      }
    ]

    const replaceSettings = vi.fn().mockResolvedValue(undefined)
    providerStore.setState({
      ...providerStore.getState(),
      data: {
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-openai' }
          },
          deepgram: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'dg-secret' }
          }
        },
        providerSettings: {},
        activeProviders: {
          llm: 'openai',
          asr: 'deepgram'
        }
      },
      replace: replaceSettings
    })

    await renderProviders()

    const llmSection = screen.getByText('LLM Providers').closest('section')
    expect(llmSection).toBeTruthy()
    fireEvent.click(within(llmSection as HTMLElement).getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(replaceSettings).toHaveBeenCalledWith({
        providers: {
          deepgram: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'dg-secret' }
          }
        },
        providerSettings: {},
        activeProviders: {
          asr: 'deepgram'
        }
      })
    })
  })

  test('constrains and centers the page content', async () => {
    const { container } = await renderProviders()

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })

  test('shows updated provider page copy', async () => {
    await renderProviders()

    expect(
      screen.getByText('Connect multiple providers, then choose which one each pipeline uses.')
    ).toBeTruthy()
  })

  test('orders providers as active first, then connected, then not connected while preserving group order', async () => {
    llmProviders = [
      {
        id: 'first-connected',
        displayName: 'First Connected',
        description: 'First connected provider',
        icon: null,
        connectionOptions: [
          {
            type: 'apiKey',
            label: 'API Key',
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      },
      {
        id: 'active-provider',
        displayName: 'Active Provider',
        description: 'Currently active provider',
        icon: null,
        connectionOptions: [
          {
            type: 'apiKey',
            label: 'API Key',
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      },
      {
        id: 'second-connected',
        displayName: 'Second Connected',
        description: 'Second connected provider',
        icon: null,
        connectionOptions: [
          {
            type: 'apiKey',
            label: 'API Key',
            fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
          }
        ]
      },
      {
        id: 'not-connected',
        displayName: 'Not Connected',
        description: 'Not connected provider',
        icon: null,
        connectionOptions: [
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
        providers: {
          'first-connected': {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-first' }
          },
          'active-provider': {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-active' }
          },
          'second-connected': {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-second' }
          }
        },
        providerSettings: {},
        activeProviders: {
          llm: 'active-provider'
        }
      }
    })

    await renderProviders()

    const llmSection = screen.getByText('LLM Providers').closest('section')
    expect(llmSection).toBeTruthy()

    const providerNames = within(llmSection as HTMLElement)
      .getAllByText(
        /First Connected|Active Provider|Second Connected|Not Connected/
      )
      .map((element) => element.textContent)

    expect(providerNames).toEqual([
      'First Connected',
      'Active Provider',
      'Second Connected',
      'Not Connected'
    ])
  })

  test('shows provider helper text in a tooltip when hovering Connect', async () => {
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

    await renderProviders()

    expect(screen.queryByText('Browser sign-in required')).toBeNull()

    const connectButton = screen.getByRole('button', { name: 'Connect' })
    fireEvent.mouseEnter(connectButton)

    expect(screen.getByRole('tooltip').textContent).toContain('Browser sign-in required')

    fireEvent.mouseLeave(connectButton)

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })
})
