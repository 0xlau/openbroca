// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

vi.mock('@openbroca/ui', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  )
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: ({
    'data-testid': tid,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { 'data-testid'?: string }) => (
    <span data-testid={tid} {...props} />
  )
}))

vi.mock('@renderer/stores/onboarding-store', () => ({
  markOnboardingComplete: vi.fn()
}))

vi.mock('@renderer/hooks/use-platform', () => ({
  usePlatform: () => ({ isMac: false, isWindows: false, isLinux: true })
}))

const usePermissionsStepReady = vi.fn()
const useProvidersStepReady = vi.fn()
const useShortcutsStepReady = vi.fn()

vi.mock('../steps/permissions-step', () => ({
  PermissionsStep: ({ variant }: { variant?: string }) => (
    <div data-testid="permissions-step" data-variant={variant ?? 'wizard'} />
  ),
  usePermissionsStepReady: () => usePermissionsStepReady()
}))
vi.mock('../steps/providers-step', () => ({
  ProvidersStep: () => <div data-testid="providers-step" />,
  useProvidersStepReady: () => useProvidersStepReady()
}))
vi.mock('../steps/shortcuts-step', () => ({
  ShortcutsStep: () => <div data-testid="shortcuts-step" />,
  useShortcutsStepReady: () => useShortcutsStepReady()
}))

async function renderAt(path: string): Promise<void> {
  const { OnboardingShell } = await import('../shell')
  const { PermissionsStep } = await import('../steps/permissions-step')
  const { ProvidersStep } = await import('../steps/providers-step')
  const { ShortcutsStep } = await import('../steps/shortcuts-step')

  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingShell />}>
          <Route path="permissions" element={<PermissionsStep />} />
          <Route path="providers" element={<ProvidersStep />} />
          <Route path="shortcuts" element={<ShortcutsStep />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('OnboardingShell', () => {
  beforeEach(() => {
    vi.resetModules()
    usePermissionsStepReady.mockReturnValue(false)
    useProvidersStepReady.mockReturnValue(false)
    useShortcutsStepReady.mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  test('renders stepper and the permissions outlet at /onboarding/permissions', async () => {
    await renderAt('/onboarding/permissions')
    expect(screen.getByTestId('permissions-step')).toBeTruthy()
    expect(screen.getByTestId('onboarding-stepper')).toBeTruthy()
  })

  test('Continue button is disabled when current step is not ready', async () => {
    usePermissionsStepReady.mockReturnValue(false)
    await renderAt('/onboarding/permissions')
    const button = screen.getByRole('button', { name: /Continue/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  test('Continue button is enabled when current step is ready', async () => {
    usePermissionsStepReady.mockReturnValue(true)
    await renderAt('/onboarding/permissions')
    const button = screen.getByRole('button', { name: /Continue/i }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  test('Continue navigates from permissions to providers', async () => {
    usePermissionsStepReady.mockReturnValue(true)
    await renderAt('/onboarding/permissions')
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    expect(screen.getByTestId('providers-step')).toBeTruthy()
  })

  test('Back navigates from providers to permissions', async () => {
    usePermissionsStepReady.mockReturnValue(true)
    useProvidersStepReady.mockReturnValue(false)
    await renderAt('/onboarding/providers')
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getByTestId('permissions-step')).toBeTruthy()
  })

  test('shortcuts step Continue label is "Open OpenBroca →"', async () => {
    useShortcutsStepReady.mockReturnValue(true)
    await renderAt('/onboarding/shortcuts')
    expect(screen.getByRole('button', { name: /Open OpenBroca/ })).toBeTruthy()
  })

  test('recovery variant renders only PermissionsStep without stepper', async () => {
    await renderAt('/onboarding/permissions?variant=recovery')
    const step = screen.getByTestId('permissions-step')
    expect(step.dataset.variant).toBe('recovery')
    expect(screen.queryByTestId('onboarding-stepper')).toBeNull()
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull()
  })
})
