// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createStore } from 'zustand'
import { MemoryRouter } from 'react-router'
import type { PersistedStoreState } from '@renderer/stores/create-persisted-store'
import type { ShortcutSettings } from '../../../../../shared/shortcuts'
import { resolveDefaultShortcutSettings } from '../../../../../shared/shortcuts'

type ShortcutStoreState = PersistedStoreState<ShortcutSettings>

type ElectronWindow = Window & {
  electron?: {
    process?: {
      platform?: string
    }
  }
}

function getTestRendererPlatform(): string | undefined {
  if (typeof window !== 'undefined') {
    return (window as ElectronWindow).electron?.process?.platform ?? globalThis.process?.platform
  }

  return globalThis.process?.platform
}

const EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS =
  resolveDefaultShortcutSettings(getTestRendererPlatform())

let shortcutsStoreMock: ReturnType<typeof createShortcutsStore>

function createShortcutsStore(data: ShortcutSettings) {
  return createStore<ShortcutStoreState>((set, get) => ({
    data,
    isHydrated: true,
    update: vi.fn(async (partial) => {
      set({ data: { ...get().data, ...partial } })
    }),
    replace: vi.fn(async (nextData) => {
      set({ data: nextData })
    }),
    hydrate: vi.fn(async () => {})
  }))
}

function createFailingOptimisticStore(data: ShortcutSettings) {
  return createStore<ShortcutStoreState>((set, get) => ({
    data,
    isHydrated: true,
    update: vi.fn(async (partial) => {
      set({ data: { ...get().data, ...partial } })
      throw new Error('Save failed in test')
    }),
    replace: vi.fn(async (nextData) => {
      set({ data: nextData })
    }),
    hydrate: vi.fn(async () => {})
  }))
}

function createFailingRollbackStore(data: ShortcutSettings) {
  return createStore<ShortcutStoreState>((set, get) => ({
    data,
    isHydrated: true,
    update: vi.fn(async (partial) => {
      set({ data: { ...get().data, ...partial } })
      throw new Error('Save failed in test')
    }),
    replace: vi.fn(async () => {
      throw new Error('Rollback failed in test')
    }),
    hydrate: vi.fn(async () => {})
  }))
}

vi.mock('@renderer/stores/shortcuts-store', () => ({
  defaultShortcutSettings: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS,
  get shortcutsStore() {
    return shortcutsStoreMock
  }
}))

vi.mock('@renderer/components/sidebar-nav-link', () => ({
  SidebarNavLink: ({ item }: { item: { name: string; url: string } }) => (
    <a href={item.url}>{item.name}</a>
  )
}))

describe('Shortcuts', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    shortcutsStoreMock = createShortcutsStore({ ...EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS })
  })

  test('includes shortcuts in settings navigation', async () => {
    const { NavSettings } = await import('@renderer/components/nav-settings')

    render(
      <MemoryRouter>
        <NavSettings />
      </MemoryRouter>
    )

    const shortcutsLink = screen.getByRole('link', { name: 'Shortcuts' })
    expect(shortcutsLink.getAttribute('href')).toBe('/shortcuts')
  })

  test('renders the three shortcut sections with persisted defaults', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    expect((screen.getByLabelText('Quick shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator
    )
    expect((screen.getByLabelText('To Hold key') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey
    )
    expect((screen.getByLabelText('Hold shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    )
  })

  test('shows a validation error and disables save when hold matches quick', async () => {
    shortcutsStoreMock = createShortcutsStore({
      quickAccelerator: 'Control',
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    })
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Hold shortcut'), {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true
    })

    expect(screen.getByText('Hold cannot use the same shortcut as Quick.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Save changes' }).getAttribute('disabled')
    ).not.toBeNull()
  })

  test('resets editor values back to defaults without persisting immediately', async () => {
    shortcutsStoreMock = createShortcutsStore({
      quickAccelerator: 'CommandOrControl+K',
      toHoldKey: 'F',
      holdAccelerator: 'CommandOrControl+Shift+K'
    })
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))

    expect((screen.getByLabelText('Quick shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator
    )
    expect((screen.getByLabelText('To Hold key') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey
    )
    expect((screen.getByLabelText('Hold shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(shortcutsStoreMock.getState().update).not.toHaveBeenCalled()
  })

  test('normalizes captured combination keys and persists them on save', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: 'ArrowUp',
      code: 'ArrowUp',
      altKey: true
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(shortcutsStoreMock.getState().update).toHaveBeenCalledWith({
      quickAccelerator: 'Option+Up',
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    })
  })

  test('preserves the exact modifier pressed when capturing accelerators', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(shortcutsStoreMock.getState().update).toHaveBeenCalledWith({
      quickAccelerator: 'Control+K',
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    })
  })

  test('captures quick shortcut as a single modifier token', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(shortcutsStoreMock.getState().update).toHaveBeenCalledWith({
      quickAccelerator: 'Control',
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    })
  })

  test('shows a Double Tap hint when quick shortcut is a single modifier', async () => {
    shortcutsStoreMock = createShortcutsStore({
      quickAccelerator: 'Command',
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    })
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    expect(screen.getByText('Double Tap Command to trigger Quick.')).toBeTruthy()
  })

  test('captures hold shortcut as a single modifier token', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Hold shortcut'), {
      key: 'Alt',
      code: 'AltLeft',
      altKey: true
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(shortcutsStoreMock.getState().update).toHaveBeenCalledWith({
      quickAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator,
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: 'Option'
    })
  })

  test('shows a Double Tap hint when hold shortcut is a single modifier', async () => {
    shortcutsStoreMock = createShortcutsStore({
      quickAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator,
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: 'Option'
    })
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    expect(screen.getByText('Double Tap Option to trigger Hold.')).toBeTruthy()
  })

  test('keeps to hold key unchanged when only a modifier key is pressed', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('To Hold key'), {
      key: 'Shift',
      code: 'ShiftLeft',
      shiftKey: true
    })

    expect((screen.getByLabelText('To Hold key') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  test('rejects punctuation keys with a visible error and keeps draft unchanged', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: '/',
      code: 'Slash',
      altKey: true
    })

    expect(screen.getByText('Unsupported key "/".')).toBeTruthy()

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: '?',
      code: 'Slash',
      altKey: true
    })

    expect(screen.getByText('Unsupported key "?".')).toBeTruthy()
    expect((screen.getByLabelText('Quick shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  test('captures shifted digit physical keys as base digit token', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: '!',
      code: 'Digit1',
      shiftKey: true
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(shortcutsStoreMock.getState().update).toHaveBeenCalledWith({
      quickAccelerator: 'Shift+1',
      toHoldKey: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
      holdAccelerator: EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    })
  })

  test('rejects numpad digits with a visible error and without draft mutation', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: '1',
      code: 'Numpad1',
      altKey: true
    })

    expect(screen.getByText('Unsupported key "Numpad1".')).toBeTruthy()
    expect((screen.getByLabelText('Quick shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  test('rejects numpad enter with a visible error and without draft mutation', async () => {
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Hold shortcut'), {
      key: 'Enter',
      code: 'NumpadEnter',
      altKey: true
    })

    expect(screen.getByText('Unsupported key "NumpadEnter".')).toBeTruthy()
    expect((screen.getByLabelText('Hold shortcut') as HTMLInputElement).value).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  test('keeps draft dirty after failed save so save action stays available', async () => {
    shortcutsStoreMock = createFailingOptimisticStore({ ...EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS })
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Save failed in test')).toBeTruthy()
    expect(shortcutsStoreMock.getState().data.quickAccelerator).toBe(
      EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS.quickAccelerator
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save changes' }).getAttribute('disabled')).toBeNull()

    cleanup()
    render(<Shortcuts />)

    expect((screen.getByLabelText('Quick shortcut') as HTMLInputElement).value).toBe('Control+K')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  test('handles rollback failure after save failure and keeps retry path', async () => {
    shortcutsStoreMock = createFailingRollbackStore({ ...EFFECTIVE_DEFAULT_SHORTCUT_SETTINGS })
    const { Shortcuts } = await import('../shortcuts')

    render(<Shortcuts />)

    fireEvent.keyDown(screen.getByLabelText('Quick shortcut'), {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Save failed in test Rollback failed in test')).toBeTruthy()
    expect((screen.getByLabelText('Quick shortcut') as HTMLInputElement).value).toBe('Control+K')
    expect(screen.getByRole('button', { name: 'Save changes' }).getAttribute('disabled')).toBeNull()
  })

  test('includes /shortcuts in router configuration', async () => {
    const createHashRouter = vi.fn((routes) => ({ routes }))

    vi.doMock('react-router', () => ({
      createHashRouter
    }))
    vi.doMock('@renderer/pages/main/about-me', () => ({ AboutMe: () => null }))
    vi.doMock('@renderer/pages/main/dashboard', () => ({ Dashboard: () => null }))
    vi.doMock('@renderer/pages/main/dictionary', () => ({ Dictionary: () => null }))
    vi.doMock('@renderer/pages/main/brocas', () => ({ Brocas: () => null }))
    vi.doMock('@renderer/pages/main/instructions', () => ({ Instructions: () => null }))
    vi.doMock('@renderer/pages/main/providers', () => ({ Providers: () => null }))
    vi.doMock('@renderer/pages/main/prompts', () => ({ Prompts: () => null }))
    vi.doMock('@renderer/pages/main/shortcuts', () => ({ Shortcuts: () => null }))
    vi.doMock('@renderer/pages/main/main-root', () => ({ MainRoot: () => null }))
    vi.doMock('@renderer/pages/float/float-listening', () => ({ FloatListening: () => null }))
    vi.doMock('@renderer/pages/notify/notify-window', () => ({ NotifyWindow: () => null }))
    vi.doMock('@renderer/pages/onboarding/shell', () => ({ OnboardingShell: () => null }))
    vi.doMock('@renderer/pages/onboarding/steps/permissions-step', () => ({
      PermissionsStep: () => null,
      usePermissionsStepReady: () => false
    }))
    vi.doMock('@renderer/pages/onboarding/steps/providers-step', () => ({
      ProvidersStep: () => null,
      useProvidersStepReady: () => false
    }))
    vi.doMock('@renderer/pages/onboarding/steps/shortcuts-step', () => ({
      ShortcutsStep: () => null,
      useShortcutsStepReady: () => false
    }))

    await import('@renderer/router/index')

    const routes = createHashRouter.mock.calls[0]?.[0] as Array<{
      path?: string
      children?: Array<{ path?: string }>
    }>
    const mainRoute = routes.find((route) => route.path === '/')

    expect(mainRoute?.children?.some((route) => route.path === 'shortcuts')).toBe(true)
  })
})
