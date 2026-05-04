// @vitest-environment jsdom

import React from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type {
  OnboardingGateSnapshot,
  PermissionItem
} from '../../../../../../main/onboarding-gate/types'

vi.mock('@openbroca/ui', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  CardFooter: ({ children, ...props }: React.ComponentProps<'div'>) => (
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
  HugeiconsIcon: ({
    'data-testid': dataTestId,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { 'data-testid'?: string }) => (
    <span data-testid={dataTestId} {...props} />
  )
}))

vi.mock('@renderer/assets/logo.svg?react', () => ({
  default: (props: React.ComponentProps<'div'>) => <div data-testid="openbroca-logo" {...props} />
}))

function createPermission(
  overrides: Partial<PermissionItem> & Pick<PermissionItem, 'key'>
): PermissionItem {
  const { key, ...rest } = overrides

  return {
    key,
    title: key === 'microphone' ? 'Microphone' : 'Desktop Control',
    description:
      key === 'microphone'
        ? 'Required to capture your voice.'
        : 'Required to paste the final text into your current app.',
    status: 'missing',
    ...rest
  }
}

function createSnapshot(overrides: Partial<OnboardingGateSnapshot> = {}): OnboardingGateSnapshot {
  return {
    platform: 'darwin',
    mode: 'first-run',
    canEnterMainWindow: false,
    permissionsOk: false,
    hasCompletedOnboarding: false,
    permissions: [
      createPermission({ key: 'microphone', status: 'missing' }),
      createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
    ],
    ...overrides
  }
}

function installMediaDevicesMock(behavior: 'success' | 'denied' | 'unavailable' = 'success') {
  if (behavior === 'unavailable') {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined
    })
    return { getUserMedia: vi.fn(), stop: vi.fn() }
  }

  const stop = vi.fn()
  const getUserMedia =
    behavior === 'success'
      ? vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
      : vi.fn().mockRejectedValue(new Error('NotAllowedError'))

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia }
  })
  return { getUserMedia, stop }
}

async function renderPage(
  options: {
    snapshot?: OnboardingGateSnapshot
    microphoneSnapshot?: OnboardingGateSnapshot
    accessibilitySnapshot?: OnboardingGateSnapshot
    refreshSnapshot?: OnboardingGateSnapshot
    snapshotError?: Error
    microphoneError?: Error
    accessibilityError?: Error
    refreshError?: Error
  } = {}
) {
  const getSnapshot = options.snapshotError
    ? vi.fn().mockRejectedValue(options.snapshotError)
    : vi.fn().mockResolvedValue(options.snapshot ?? createSnapshot())
  const requestMicrophone = options.microphoneError
    ? vi.fn().mockRejectedValue(options.microphoneError)
    : vi.fn().mockResolvedValue(
        options.microphoneSnapshot ??
          createSnapshot({
            permissions: [
              createPermission({ key: 'microphone', status: 'granted' }),
              createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
            ]
          })
      )
  const openDesktopControlSettings = options.accessibilityError
    ? vi.fn().mockRejectedValue(options.accessibilityError)
    : vi.fn().mockResolvedValue(
        options.accessibilitySnapshot ??
          createSnapshot({
            permissions: [
              createPermission({ key: 'microphone', status: 'missing' }),
              createPermission({ key: 'desktopControl', status: 'granted' })
            ]
          })
      )
  const refresh = options.refreshError
    ? vi.fn().mockRejectedValue(options.refreshError)
    : vi.fn().mockResolvedValue(options.refreshSnapshot ?? options.snapshot ?? createSnapshot())
  const quitApp = vi.fn().mockResolvedValue(undefined)

  let onStateChangeCallback: ((snapshot: OnboardingGateSnapshot) => void) | null = null
  const onStateChange = vi.fn((callback: (snapshot: OnboardingGateSnapshot) => void) => {
    onStateChangeCallback = callback
    return () => {
      onStateChangeCallback = null
    }
  })

  window.api = {
    ...window.api,
    permissions: {
      getSnapshot,
      requestMicrophone,
      openDesktopControlSettings,
      refresh,
      quitApp,
      onStateChange
    }
  }

  const { PermissionsStep } = await import('../permissions-step')
  render(<PermissionsStep variant="recovery" />)

  await waitFor(() => {
    expect(getSnapshot).toHaveBeenCalledTimes(1)
  })

  return {
    getSnapshot,
    requestMicrophone,
    openDesktopControlSettings,
    refresh,
    triggerStateChange: (snapshot: OnboardingGateSnapshot) => {
      onStateChangeCallback?.(snapshot)
    }
  }
}

describe('PermissionsStep', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined
    })
  })

  test('renders the permission cards with layout copy and a continue action', async () => {
    await renderPage()

    expect(screen.getByTestId('openbroca-logo')).toBeTruthy()
    expect(screen.getByText('Permission Required')).toBeTruthy()
    expect(screen.getByText('Allow microphone and accessibility access to continue.')).toBeTruthy()
    const cards = await screen.findAllByTestId('permission-card')
    expect(cards).toHaveLength(2)
    expect(screen.getByText('Microphone Access')).toBeTruthy()
    expect(
      screen.getByText('Allow openbroca to hear your voice and provide real-time responses.')
    ).toBeTruthy()
    expect(screen.getByText('Your audio is private and secure')).toBeTruthy()
    expect(screen.getByText('Accessibility Access')).toBeTruthy()
    expect(
      screen.getByText('Allow OpenBroca to paste into other apps and streamline your workflow')
    ).toBeTruthy()
    expect(screen.getByText("You're in control at all times")).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Grant Access' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Continue to OpenBroca' })).toBeTruthy()
    expect(screen.getByText('You can change these settings anytime in Preferences.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Refresh permissions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Quit for now' })).toBeNull()
  })

  test('probes the microphone via getUserMedia and refreshes when status was missing', async () => {
    const media = installMediaDevicesMock('success')
    const { requestMicrophone, refresh } = await renderPage()

    const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Microphone Access')
    )

    expect(microphoneCard).toBeTruthy()
    fireEvent.click(
      within(microphoneCard as HTMLElement).getByRole('button', { name: 'Grant Access' })
    )

    await waitFor(() => {
      expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true })
    })
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1)
    })
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(requestMicrophone).not.toHaveBeenCalled()
  })

  test('refreshes (no settings fallback) when status was missing and the probe is denied', async () => {
    const media = installMediaDevicesMock('denied')
    const { requestMicrophone, refresh } = await renderPage()

    const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Microphone Access')
    )

    fireEvent.click(
      within(microphoneCard as HTMLElement).getByRole('button', { name: 'Grant Access' })
    )

    await waitFor(() => {
      expect(media.getUserMedia).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1)
    })
    expect(requestMicrophone).not.toHaveBeenCalled()
  })

  test('falls back to opening System Settings when status is needs-manual-step and the probe fails', async () => {
    const media = installMediaDevicesMock('denied')
    const { requestMicrophone, refresh } = await renderPage({
      snapshot: createSnapshot({
        permissions: [
          createPermission({ key: 'microphone', status: 'needs-manual-step' }),
          createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
        ]
      })
    })

    const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Microphone Access')
    )

    fireEvent.click(
      within(microphoneCard as HTMLElement).getByRole('button', { name: 'Grant Access' })
    )

    await waitFor(() => {
      expect(media.getUserMedia).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(requestMicrophone).toHaveBeenCalledTimes(1)
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  test('refreshes when status is needs-manual-step but the probe unexpectedly succeeds', async () => {
    const media = installMediaDevicesMock('success')
    const { requestMicrophone, refresh } = await renderPage({
      snapshot: createSnapshot({
        permissions: [
          createPermission({ key: 'microphone', status: 'needs-manual-step' }),
          createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
        ]
      })
    })

    const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Microphone Access')
    )

    fireEvent.click(
      within(microphoneCard as HTMLElement).getByRole('button', { name: 'Grant Access' })
    )

    await waitFor(() => {
      expect(media.getUserMedia).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1)
    })
    expect(media.stop).toHaveBeenCalledTimes(1)
    expect(requestMicrophone).not.toHaveBeenCalled()
  })

  test('opens system settings from the accessibility card', async () => {
    const { openDesktopControlSettings } = await renderPage()

    const accessibilityCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Accessibility Access')
    )

    expect(accessibilityCard).toBeTruthy()
    fireEvent.click(
      within(accessibilityCard as HTMLElement).getByRole('button', { name: 'Grant Access' })
    )

    await waitFor(() => {
      expect(openDesktopControlSettings).toHaveBeenCalledTimes(1)
    })
  })

  test('shows a disabled success button with a check icon after a permission is granted', async () => {
    await renderPage({
      snapshot: createSnapshot({
        permissions: [
          createPermission({ key: 'microphone', status: 'granted' }),
          createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
        ]
      })
    })

    const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Microphone Access')
    )

    expect(microphoneCard).toBeTruthy()

    const button = within(microphoneCard as HTMLElement).getByRole('button', { name: 'Granted' })

    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('variant')).toBe('secondary')
    expect(
      within(microphoneCard as HTMLElement).getByTestId('permission-action-icon-check')
    ).toBeTruthy()
  })

  test('keeps continue disabled until every permission is granted', async () => {
    await renderPage()

    const continueButton = screen.getByRole('button', { name: 'Continue to OpenBroca' })

    expect(continueButton.hasAttribute('disabled')).toBe(true)
  })

  test('refreshes permissions from the continue button after every permission is granted', async () => {
    const { refresh } = await renderPage({
      snapshot: createSnapshot({
        canEnterMainWindow: true,
        permissionsOk: true,
        hasCompletedOnboarding: true,
        mode: 'none',
        permissions: [
          createPermission({ key: 'microphone', status: 'granted' }),
          createPermission({ key: 'desktopControl', status: 'granted' })
        ]
      }),
      refreshSnapshot: createSnapshot({
        canEnterMainWindow: true,
        permissionsOk: true,
        hasCompletedOnboarding: true,
        mode: 'none',
        permissions: [
          createPermission({ key: 'microphone', status: 'granted' }),
          createPermission({ key: 'desktopControl', status: 'granted' })
        ]
      })
    })

    const continueButton = screen.getByRole('button', { name: 'Continue to OpenBroca' })

    expect(continueButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(continueButton)

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1)
    })
  })

  test('shows a minimal error message when the initial snapshot load fails', async () => {
    await renderPage({
      snapshotError: new Error('Load failed in test')
    })

    expect(await screen.findByText('Load failed in test')).toBeTruthy()
    expect(screen.queryByTestId('permission-card')).toBeNull()
  })

  test('updates the UI when the main process pushes a permission state change', async () => {
    const { triggerStateChange } = await renderPage()

    expect(
      (screen.getByRole('button', { name: 'Continue to OpenBroca' }) as HTMLButtonElement).disabled
    ).toBe(true)

    const granted = createSnapshot({
      canEnterMainWindow: false,
      permissions: [
        createPermission({ key: 'microphone', status: 'granted' }),
        createPermission({ key: 'desktopControl', status: 'needs-manual-step' })
      ]
    })

    await act(async () => {
      triggerStateChange(granted)
    })

    const microphoneCard = (await screen.findAllByTestId('permission-card')).find((card) =>
      within(card).queryByText('Microphone Access')
    )
    expect(microphoneCard).toBeTruthy()
    const grantButton = within(microphoneCard as HTMLElement).getByRole(
      'button'
    ) as HTMLButtonElement
    expect(grantButton.textContent).toContain('Granted')
    expect(grantButton.disabled).toBe(true)
  })

  test('wizard variant does not render the standalone Continue button', async () => {
    const getSnapshot = vi.fn().mockResolvedValue(createSnapshot())
    const onStateChange = vi.fn(() => () => {})

    window.api = {
      ...window.api,
      permissions: {
        getSnapshot,
        requestMicrophone: vi.fn(),
        openDesktopControlSettings: vi.fn(),
        refresh: vi.fn(),
        quitApp: vi.fn(),
        onStateChange
      }
    }

    const { PermissionsStep } = await import('../permissions-step')
    render(<PermissionsStep variant="wizard" />)
    await waitFor(() => expect(getSnapshot).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Continue to OpenBroca' })).toBeNull()
  })
})
