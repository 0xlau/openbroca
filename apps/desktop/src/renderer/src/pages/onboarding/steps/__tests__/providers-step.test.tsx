// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@openbroca/ui', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  )
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span />
}))

const llmList = [
  { id: 'openai', displayName: 'OpenAI', description: 'OpenAI featured' },
  { id: 'openrouter', displayName: 'OpenRouter', description: 'Aggregator' },
  { id: 'anthropic', displayName: 'Anthropic', description: 'Not featured' }
]
const asrList = [
  { id: 'deepgram', displayName: 'Deepgram', description: 'Cloud' },
  { id: 'sherpa-onnx', displayName: 'Sherpa-ONNX', description: 'Local' }
]

vi.mock('@renderer/trpc', () => ({
  trpc: {
    providers: {
      listLLM: { useQuery: () => ({ data: llmList }) },
      listASR: { useQuery: () => ({ data: asrList }) }
    },
    providerAuth: {
      status: { useQuery: () => ({ data: undefined }) }
    },
    useUtils: () => ({
      providerAuth: {
        status: { setData: vi.fn() }
      }
    })
  }
}))

interface ProviderStoreData {
  providers: Record<string, { enabled?: boolean } | undefined>
  providerSettings: Record<string, Record<string, unknown> | undefined>
  activeProviders: { llm?: string; asr?: string }
}

const providerStoreState: {
  data: ProviderStoreData
  isHydrated: boolean
  update: ReturnType<typeof vi.fn>
  replace: ReturnType<typeof vi.fn>
  hydrate: ReturnType<typeof vi.fn>
} = {
  data: {
    providers: {},
    providerSettings: {},
    activeProviders: {}
  },
  isHydrated: true,
  update: vi.fn(async () => {}),
  replace: vi.fn(async () => {}),
  hydrate: vi.fn(async () => {})
}

vi.mock('@renderer/stores/provider-store', () => ({
  providerStore: {
    getState: () => providerStoreState,
    subscribe: vi.fn(),
    setState: vi.fn(),
    destroy: vi.fn()
  },
  upsertProviderConnection: vi.fn(async () => {})
}))

vi.mock('zustand', () => ({
  useStore: () => providerStoreState
}))

vi.mock('@renderer/components/providers/provider-types', () => ({
  toProviderViewModel: (d: { id: string; displayName: string; description: string }) => ({
    id: d.id,
    displayName: d.displayName,
    description: d.description
  })
}))

vi.mock('@renderer/components/providers/provider-connect-dialog', () => ({
  ProviderConnectDialog: ({
    open,
    provider
  }: {
    open: boolean
    provider: { id: string } | null
  }) => (open ? <div data-testid="connect-dialog" data-provider={provider?.id ?? ''} /> : null)
}))

vi.mock('@renderer/components/providers/provider-settings-dialog', () => ({
  ProviderSettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="settings-dialog" /> : null
}))

describe('ProvidersStep', () => {
  beforeEach(() => {
    vi.resetModules()
    providerStoreState.data = {
      providers: {},
      providerSettings: {},
      activeProviders: {}
    }
  })
  afterEach(() => cleanup())

  test('renders only featured providers by default', async () => {
    const { ProvidersStep } = await import('../providers-step')
    render(<ProvidersStep />)
    expect(screen.getByTestId('onboarding-provider-card-openai')).toBeTruthy()
    expect(screen.getByTestId('onboarding-provider-card-openrouter')).toBeTruthy()
    expect(screen.queryByTestId('onboarding-provider-card-anthropic')).toBeNull()
  })

  test('expanding "Show all" reveals non-featured LLM providers', async () => {
    const { ProvidersStep } = await import('../providers-step')
    render(<ProvidersStep />)
    fireEvent.click(screen.getByTestId('onboarding-llm-show-all'))
    expect(screen.getByTestId('onboarding-provider-card-anthropic')).toBeTruthy()
  })

  test('clicking Connect opens ProviderConnectDialog with the provider', async () => {
    const { ProvidersStep } = await import('../providers-step')
    render(<ProvidersStep />)
    const card = screen.getByTestId('onboarding-provider-card-openai')
    const buttons = card.querySelectorAll('button')
    fireEvent.click(buttons[0]!)
    expect(screen.getByTestId('connect-dialog').getAttribute('data-provider')).toBe('openai')
  })

  test('status text reflects readiness', async () => {
    const { ProvidersStep } = await import('../providers-step')
    const { rerender } = render(<ProvidersStep />)
    expect(screen.getByTestId('onboarding-providers-status').textContent).toContain(
      'Connect at least'
    )

    providerStoreState.data.activeProviders = { llm: 'openai', asr: 'deepgram' }
    rerender(<ProvidersStep />)
    expect(screen.getByTestId('onboarding-providers-status').textContent).toContain('Ready')
  })

  test('useProvidersStepReady returns true when both active', async () => {
    providerStoreState.data.activeProviders = { llm: 'openai', asr: 'deepgram' }
    const { useProvidersStepReady } = await import('../providers-step')

    function Probe(): React.ReactElement {
      return <div data-testid="ready">{String(useProvidersStepReady())}</div>
    }
    render(<Probe />)
    expect(screen.getByTestId('ready').textContent).toBe('true')
  })

  test('useProvidersStepReady returns false when one missing', async () => {
    providerStoreState.data.activeProviders = { llm: 'openai' }
    const { useProvidersStepReady } = await import('../providers-step')

    function Probe(): React.ReactElement {
      return <div data-testid="ready">{String(useProvidersStepReady())}</div>
    }
    render(<Probe />)
    expect(screen.getByTestId('ready').textContent).toBe('false')
  })
})
