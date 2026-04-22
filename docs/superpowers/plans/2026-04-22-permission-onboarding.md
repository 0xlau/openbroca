# Desktop Permission Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS-only blocking permission onboarding flow that keeps the desktop app out of the main window until `Microphone` and `Desktop Control` permissions are granted.

**Architecture:** Add a small main-process permission-gate service that normalizes macOS permission state and decides whether startup should open the main window or a dedicated onboarding window. Keep the renderer page presentation-only, expose permission actions through preload IPC, and use `@openbroca/ui` shadcn-style primitives for the onboarding UI.

**Tech Stack:** Electron 39, TypeScript, React 19, React Router, Vitest, Testing Library, `@openbroca/ui`, Tailwind CSS 4

---

## File Structure

### New Files

- `apps/desktop/src/main/permission-gate/types.ts`
  Defines normalized permission keys, states, and the startup snapshot returned to the renderer and startup gate.
- `apps/desktop/src/main/permission-gate/macos.ts`
  Owns macOS-specific permission checks and request helpers for microphone and accessibility trust.
- `apps/desktop/src/main/permission-gate/service.ts`
  Centralizes platform branching, permission snapshot assembly, and "can enter main window" logic.
- `apps/desktop/src/main/__tests__/permission-gate.test.ts`
  Covers normalized state mapping, macOS-vs-Windows startup gating, and the action helpers exposed to the main process.
- `apps/desktop/src/main/windows/permission-onboarding-window.ts`
  Creates the dedicated onboarding `BrowserWindow` and loads the onboarding route.
- `apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`
  Renders the permission onboarding page using `@openbroca/ui` primitives only.
- `apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`
  Verifies status rendering, button behavior, and blocked-state UX.

### Modified Files

- `apps/desktop/src/main/windows/index.ts`
  Re-exports the onboarding window factory.
- `apps/desktop/src/main/window-manager.ts`
  Tracks the onboarding window lifecycle and provides close/get/create helpers.
- `apps/desktop/src/main/__tests__/window-manager.test.ts`
  Adds onboarding-window lifecycle assertions without regressing floating-window behavior.
- `apps/desktop/src/main/index.ts`
  Inserts the startup permission gate, registers onboarding IPC handlers, and auto-advances to the main window when all permissions pass.
- `apps/desktop/src/preload/index.ts`
  Exposes the onboarding permission API on `window.api.permissions`.
- `apps/desktop/src/preload/index.d.ts`
  Declares the permission bridge types.
- `apps/desktop/src/preload/__tests__/index.test.ts`
  Verifies the new permission bridge methods.
- `apps/desktop/src/renderer/src/router/index.tsx`
  Adds the onboarding route used by the dedicated window.

## Task 1: Add The Main-Process Permission Gate Model

**Files:**
- Create: `apps/desktop/src/main/permission-gate/types.ts`
- Create: `apps/desktop/src/main/permission-gate/macos.ts`
- Create: `apps/desktop/src/main/permission-gate/service.ts`
- Create: `apps/desktop/src/main/__tests__/permission-gate.test.ts`

- [ ] **Step 1: Write the failing permission-gate tests**

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
    askForMediaAccess: vi.fn(),
    isTrustedAccessibilityClient: vi.fn()
  }
}))

describe('permission gate service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('returns startup-ready on Windows without macOS permission checks', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { resolvePermissionGateSnapshot } = await import('../permission-gate/service')

    await expect(resolvePermissionGateSnapshot()).resolves.toEqual({
      platform: 'win32',
      shouldGate: false,
      canEnterMainWindow: true,
      permissions: []
    })
  })

  test('maps missing microphone and desktop control on macOS into a blocked snapshot', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const electron = await import('electron')
    vi.mocked(electron.systemPreferences.getMediaAccessStatus).mockReturnValue('not-determined')
    vi.mocked(electron.systemPreferences.isTrustedAccessibilityClient).mockReturnValue(false)

    const { resolvePermissionGateSnapshot } = await import('../permission-gate/service')
    const snapshot = await resolvePermissionGateSnapshot()

    expect(snapshot.shouldGate).toBe(true)
    expect(snapshot.canEnterMainWindow).toBe(false)
    expect(snapshot.permissions).toEqual([
      expect.objectContaining({ key: 'microphone', status: 'missing' }),
      expect.objectContaining({ key: 'desktopControl', status: 'needs-manual-step' })
    ])
  })

  test('requests microphone access and re-maps the refreshed state', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const electron = await import('electron')
    vi.mocked(electron.systemPreferences.askForMediaAccess).mockResolvedValue(true)
    vi.mocked(electron.systemPreferences.getMediaAccessStatus).mockReturnValue('granted')

    const { requestMicrophonePermission } = await import('../permission-gate/service')

    await expect(requestMicrophonePermission()).resolves.toEqual(
      expect.objectContaining({ key: 'microphone', status: 'granted' })
    )
  })
})
```

- [ ] **Step 2: Run the permission-gate test to confirm the module does not exist yet**

Run: `pnpm --dir apps/desktop test src/main/__tests__/permission-gate.test.ts`
Expected: FAIL with `Cannot find module '../permission-gate/service'`

- [ ] **Step 3: Implement the normalized permission types, macOS helpers, and service**

```ts
// apps/desktop/src/main/permission-gate/types.ts
export type PermissionKey = 'microphone' | 'desktopControl'

export type PermissionStatus = 'granted' | 'missing' | 'needs-manual-step' | 'error'

export type PermissionItem = {
  key: PermissionKey
  title: string
  description: string
  status: PermissionStatus
  errorMessage?: string
}

export type PermissionGateSnapshot = {
  platform: NodeJS.Platform
  shouldGate: boolean
  canEnterMainWindow: boolean
  permissions: PermissionItem[]
}
```

```ts
// apps/desktop/src/main/permission-gate/macos.ts
import { systemPreferences } from 'electron'
import type { PermissionItem } from './types'

export function resolveMacMicrophonePermission(): PermissionItem {
  const status = systemPreferences.getMediaAccessStatus('microphone')

  if (status === 'granted') {
    return {
      key: 'microphone',
      title: 'Microphone',
      description: 'Required to capture your voice.',
      status: 'granted'
    }
  }

  return {
    key: 'microphone',
    title: 'Microphone',
    description: 'Required to capture your voice.',
    status: status === 'not-determined' ? 'missing' : 'needs-manual-step'
  }
}

export function resolveMacDesktopControlPermission(): PermissionItem {
  return {
    key: 'desktopControl',
    title: 'Desktop Control',
    description: 'Required to paste the final text into your current app.',
    status: systemPreferences.isTrustedAccessibilityClient(false)
      ? 'granted'
      : 'needs-manual-step'
  }
}

export async function requestMacMicrophonePermission(): Promise<PermissionItem> {
  await systemPreferences.askForMediaAccess('microphone')
  return resolveMacMicrophonePermission()
}

export function promptMacDesktopControlPermission(): PermissionItem {
  systemPreferences.isTrustedAccessibilityClient(true)
  return resolveMacDesktopControlPermission()
}
```

```ts
// apps/desktop/src/main/permission-gate/service.ts
import {
  promptMacDesktopControlPermission,
  requestMacMicrophonePermission,
  resolveMacDesktopControlPermission,
  resolveMacMicrophonePermission
} from './macos'
import type { PermissionGateSnapshot, PermissionItem } from './types'

export async function resolvePermissionGateSnapshot(): Promise<PermissionGateSnapshot> {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      shouldGate: false,
      canEnterMainWindow: true,
      permissions: []
    }
  }

  const permissions = [resolveMacMicrophonePermission(), resolveMacDesktopControlPermission()]

  return {
    platform: process.platform,
    shouldGate: permissions.some((item) => item.status !== 'granted'),
    canEnterMainWindow: permissions.every((item) => item.status === 'granted'),
    permissions
  }
}

export async function requestMicrophonePermission(): Promise<PermissionItem> {
  return requestMacMicrophonePermission()
}

export function requestDesktopControlPermission(): PermissionItem {
  return promptMacDesktopControlPermission()
}
```

- [ ] **Step 4: Run the permission-gate tests again**

Run: `pnpm --dir apps/desktop test src/main/__tests__/permission-gate.test.ts`
Expected: PASS with `3 passed`

- [ ] **Step 5: Commit the main-process permission-gate model**

```bash
git add \
  apps/desktop/src/main/permission-gate/types.ts \
  apps/desktop/src/main/permission-gate/macos.ts \
  apps/desktop/src/main/permission-gate/service.ts \
  apps/desktop/src/main/__tests__/permission-gate.test.ts
git commit -m "feat(desktop): add permission gate service"
```

## Task 2: Add The Onboarding Window And Startup Gate

**Files:**
- Create: `apps/desktop/src/main/windows/permission-onboarding-window.ts`
- Modify: `apps/desktop/src/main/windows/index.ts`
- Modify: `apps/desktop/src/main/window-manager.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/__tests__/window-manager.test.ts`

- [ ] **Step 1: Write failing window-manager tests for onboarding window lifecycle**

```ts
test('creates and tracks a permission onboarding window', async () => {
  const windows = await import('../windows')
  const { WindowManager } = await import('../window-manager')
  const onboardingWindow = {
    on: vi.fn(),
    isDestroyed: () => false,
    close: vi.fn()
  } as never

  vi.mocked(windows.createPermissionOnboardingWindow).mockReturnValue(onboardingWindow)

  const manager = new WindowManager()

  expect(manager.createPermissionOnboarding()).toBe(onboardingWindow)
  expect(manager.getPermissionOnboarding()).toBe(onboardingWindow)
})

test('closes the onboarding window without touching the main window', async () => {
  const windows = await import('../windows')
  const { WindowManager } = await import('../window-manager')
  const onboardingWindow = {
    on: vi.fn(),
    isDestroyed: () => false,
    close: vi.fn()
  } as never

  vi.mocked(windows.createPermissionOnboardingWindow).mockReturnValue(onboardingWindow)

  const manager = new WindowManager()
  manager.createPermissionOnboarding()
  manager.closePermissionOnboarding()

  expect(onboardingWindow.close).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the window-manager test to verify the onboarding APIs are missing**

Run: `pnpm --dir apps/desktop test src/main/__tests__/window-manager.test.ts`
Expected: FAIL with missing `createPermissionOnboardingWindow`, `createPermissionOnboarding`, or `closePermissionOnboarding`

- [ ] **Step 3: Implement the onboarding window factory, window-manager methods, and startup gate**

```ts
// apps/desktop/src/main/windows/permission-onboarding-window.ts
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

export function createPermissionOnboardingWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 720,
    height: 620,
    minWidth: 680,
    minHeight: 580,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 16 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => window.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/onboarding/permissions')
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/onboarding/permissions'
    })
  }

  return window
}
```

```ts
// apps/desktop/src/main/window-manager.ts
import { createMainWindow, createFloatingWindow, createPermissionOnboardingWindow, getFloatingWindowPosition } from './windows'

class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private floatingWindow: BrowserWindow | null = null
  private onboardingWindow: BrowserWindow | null = null

  createPermissionOnboarding(): BrowserWindow {
    this.onboardingWindow = createPermissionOnboardingWindow()
    this.onboardingWindow.on('closed', () => {
      this.onboardingWindow = null
    })
    return this.onboardingWindow
  }

  getPermissionOnboarding(): BrowserWindow | null {
    return this.onboardingWindow
  }

  closePermissionOnboarding(): void {
    if (this.onboardingWindow && !this.onboardingWindow.isDestroyed()) {
      this.onboardingWindow.close()
      this.onboardingWindow = null
    }
  }
}
```

```ts
// apps/desktop/src/main/index.ts
import { app, BrowserWindow, clipboard, ipcMain, protocol } from 'electron'
import { resolvePermissionGateSnapshot } from './permission-gate/service'

async function openStartupWindow(): Promise<void> {
  const snapshot = await resolvePermissionGateSnapshot()
  if (snapshot.canEnterMainWindow) {
    windowManager.createMain()
    return
  }

  const onboardingWindow = windowManager.createPermissionOnboarding()
  onboardingWindow.on('closed', () => {
    if (!windowManager.getMain()) {
      app.quit()
    }
  })
}

app.whenReady().then(async () => {
  // existing handler registration...
  await openStartupWindow()

  app.on('activate', async () => {
    if (!windowManager.getMain() && !windowManager.getPermissionOnboarding()) {
      await openStartupWindow()
    }
  })
})
```

- [ ] **Step 4: Run the updated window-manager tests and the main-process typecheck**

Run: `pnpm --dir apps/desktop test src/main/__tests__/window-manager.test.ts && pnpm --dir apps/desktop typecheck:node`
Expected: PASS for the new onboarding-window tests and no TypeScript errors in the main-process build

- [ ] **Step 5: Commit the startup gate and onboarding window wiring**

```bash
git add \
  apps/desktop/src/main/windows/permission-onboarding-window.ts \
  apps/desktop/src/main/windows/index.ts \
  apps/desktop/src/main/window-manager.ts \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/main/__tests__/window-manager.test.ts
git commit -m "feat(desktop): gate startup behind permission onboarding"
```

## Task 3: Expose Permission Actions Through Preload IPC

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Write failing preload tests for the permission bridge**

```ts
test('fetches the permission onboarding snapshot through the main-process bridge', async () => {
  const snapshot = {
    platform: 'darwin',
    shouldGate: true,
    canEnterMainWindow: false,
    permissions: [{ key: 'microphone', status: 'missing' }]
  }
  invoke.mockResolvedValueOnce(snapshot)
  enableContextIsolation()

  await import('../index')

  const api = getExposedApi()
  const result = await api.permissions.getSnapshot()

  expect(invoke).toHaveBeenCalledWith('permissions:get-snapshot')
  expect(result).toEqual(snapshot)
})

test('opens desktop control settings through the preload bridge', async () => {
  enableContextIsolation()
  await import('../index')

  const api = getExposedApi()
  await api.permissions.openDesktopControlSettings()

  expect(invoke).toHaveBeenCalledWith('permissions:open-desktop-control-settings')
})
```

- [ ] **Step 2: Run the preload test to confirm the permission bridge does not exist yet**

Run: `pnpm --dir apps/desktop test src/preload/__tests__/index.test.ts`
Expected: FAIL with missing `permissions` methods on the exposed API

- [ ] **Step 3: Implement the main-process IPC handlers and preload bridge**

```ts
// apps/desktop/src/main/index.ts
import {
  requestDesktopControlPermission,
  requestMicrophonePermission,
  resolvePermissionGateSnapshot
} from './permission-gate/service'

async function refreshPermissionGateAndMaybeAdvance() {
  const snapshot = await resolvePermissionGateSnapshot()
  if (snapshot.canEnterMainWindow) {
    windowManager.closePermissionOnboarding()
    if (!windowManager.getMain()) {
      windowManager.createMain()
    }
  }
  return snapshot
}

ipcMain.handle('permissions:get-snapshot', () => resolvePermissionGateSnapshot())
ipcMain.handle('permissions:request-microphone', async () => {
  await requestMicrophonePermission()
  return refreshPermissionGateAndMaybeAdvance()
})
ipcMain.handle('permissions:open-desktop-control-settings', async () => {
  requestDesktopControlPermission()
  return refreshPermissionGateAndMaybeAdvance()
})
ipcMain.handle('permissions:refresh', () => refreshPermissionGateAndMaybeAdvance())
ipcMain.handle('permissions:quit-app', () => app.quit())
```

```ts
// apps/desktop/src/preload/index.ts
const api = {
  // existing bridges...
  permissions: {
    getSnapshot: () => ipcRenderer.invoke('permissions:get-snapshot'),
    requestMicrophone: () => ipcRenderer.invoke('permissions:request-microphone'),
    openDesktopControlSettings: () =>
      ipcRenderer.invoke('permissions:open-desktop-control-settings'),
    refresh: () => ipcRenderer.invoke('permissions:refresh'),
    quitApp: () => ipcRenderer.invoke('permissions:quit-app')
  }
}
```

```ts
// apps/desktop/src/preload/index.d.ts
type PermissionBridgeSnapshot = {
  platform: NodeJS.Platform
  shouldGate: boolean
  canEnterMainWindow: boolean
  permissions: Array<{
    key: 'microphone' | 'desktopControl'
    title: string
    description: string
    status: 'granted' | 'missing' | 'needs-manual-step' | 'error'
    errorMessage?: string
  }>
}

interface WindowApi {
  permissions: {
    getSnapshot: () => Promise<PermissionBridgeSnapshot>
    requestMicrophone: () => Promise<PermissionBridgeSnapshot>
    openDesktopControlSettings: () => Promise<PermissionBridgeSnapshot>
    refresh: () => Promise<PermissionBridgeSnapshot>
    quitApp: () => Promise<void>
  }
}
```

- [ ] **Step 4: Run the preload bridge tests and node typecheck**

Run: `pnpm --dir apps/desktop test src/preload/__tests__/index.test.ts && pnpm --dir apps/desktop typecheck:node`
Expected: PASS with the new `permissions` bridge cases green and no TypeScript errors

- [ ] **Step 5: Commit the permission IPC bridge**

```bash
git add \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/preload/index.ts \
  apps/desktop/src/preload/index.d.ts \
  apps/desktop/src/preload/__tests__/index.test.ts
git commit -m "feat(desktop): expose permission onboarding bridge"
```

## Task 4: Build The macOS Permission Onboarding UI

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`
- Create: `apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`
- Modify: `apps/desktop/src/renderer/src/router/index.tsx`

- [ ] **Step 1: Write failing renderer tests for the onboarding page**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

const getSnapshot = vi.fn()
const requestMicrophone = vi.fn()
const openDesktopControlSettings = vi.fn()
const refresh = vi.fn()
const quitApp = vi.fn()

beforeEach(() => {
  getSnapshot.mockResolvedValue({
    platform: 'darwin',
    shouldGate: true,
    canEnterMainWindow: false,
    permissions: [
      {
        key: 'microphone',
        title: 'Microphone',
        description: 'Required to capture your voice.',
        status: 'missing'
      },
      {
        key: 'desktopControl',
        title: 'Desktop Control',
        description: 'Required to paste the final text into your current app.',
        status: 'needs-manual-step'
      }
    ]
  })

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      permissions: {
        getSnapshot,
        requestMicrophone,
        openDesktopControlSettings,
        refresh,
        quitApp
      }
    }
  })
})

test('renders both permission cards with blocked statuses', async () => {
  const { PermissionOnboardingPage } = await import('../permissions')
  render(<PermissionOnboardingPage />)

  expect(await screen.findByText('Microphone')).toBeInTheDocument()
  expect(screen.getByText('Desktop Control')).toBeInTheDocument()
  expect(screen.getAllByText('Not granted')).toHaveLength(2)
})

test('requests microphone permission from the card action', async () => {
  requestMicrophone.mockResolvedValueOnce({
    platform: 'darwin',
    shouldGate: true,
    canEnterMainWindow: false,
    permissions: []
  })

  const { PermissionOnboardingPage } = await import('../permissions')
  const user = userEvent.setup()
  render(<PermissionOnboardingPage />)

  await user.click(await screen.findByRole('button', { name: 'Allow microphone' }))

  expect(requestMicrophone).toHaveBeenCalledTimes(1)
})

test('shows refresh and quit actions in the footer row', async () => {
  const { PermissionOnboardingPage } = await import('../permissions')
  render(<PermissionOnboardingPage />)

  expect(await screen.findByRole('button', { name: 'Refresh status' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Quit' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the onboarding renderer test to verify the page does not exist yet**

Run: `pnpm --dir apps/desktop test src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`
Expected: FAIL with `Cannot find module '../permissions'`

- [ ] **Step 3: Implement the onboarding page and route using `@openbroca/ui` primitives only**

```tsx
// apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx
import * as React from 'react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  TypographyH3,
  TypographyMuted
} from '@openbroca/ui'

type PermissionSnapshot = Awaited<ReturnType<typeof window.api.permissions.getSnapshot>>

function statusLabel(status: PermissionSnapshot['permissions'][number]['status']): string {
  return status === 'granted' ? 'Granted' : 'Not granted'
}

export const PermissionOnboardingPage: React.FC = () => {
  const [snapshot, setSnapshot] = React.useState<PermissionSnapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const loadSnapshot = React.useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      setSnapshot(await window.api.permissions.getSnapshot())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load permissions.')
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <TypographyH3 className="text-left">Finish permission setup</TypographyH3>
        <TypographyMuted>
          OpenBroca needs both permissions below before the main window can open.
        </TypographyMuted>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4">
        {snapshot?.permissions.map((item) => (
          <Card key={item.key}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </div>
              <Badge variant={item.status === 'granted' ? 'secondary' : 'outline'}>
                {statusLabel(item.status)}
              </Badge>
            </CardHeader>
            <CardContent>
              {item.key === 'microphone' ? (
                <Button onClick={async () => setSnapshot(await window.api.permissions.requestMicrophone())}>
                  Allow microphone
                </Button>
              ) : (
                <Button variant="outline" onClick={async () => setSnapshot(await window.api.permissions.openDesktopControlSettings())}>
                  Open desktop control settings
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => window.api.permissions.quitApp()}>
          Quit
        </Button>
        <Button onClick={() => void loadSnapshot()} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh status'}
        </Button>
      </div>
    </div>
  )
}
```

```tsx
// apps/desktop/src/renderer/src/router/index.tsx
import { PermissionOnboardingPage } from '@renderer/pages/onboarding/permissions'

{
  path: '/onboarding/permissions',
  element: <PermissionOnboardingPage />
}
```

- [ ] **Step 4: Run the onboarding page tests and renderer typecheck**

Run: `pnpm --dir apps/desktop test src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx && pnpm --dir apps/desktop typecheck:web`
Expected: PASS with the onboarding cases green and no renderer TypeScript errors

- [ ] **Step 5: Commit the permission onboarding UI**

```bash
git add \
  apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx \
  apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx \
  apps/desktop/src/renderer/src/router/index.tsx
git commit -m "feat(desktop): add permission onboarding page"
```

## Task 5: Verify Auto-Advance And Startup Behavior End-To-End

**Files:**
- Modify: `apps/desktop/src/main/__tests__/permission-gate.test.ts`
- Modify: `apps/desktop/src/main/__tests__/window-manager.test.ts`
- Modify: `apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`

- [ ] **Step 1: Add failing tests for the auto-advance refresh path**

```ts
test('refresh returns a granted snapshot and the startup gate opens the main window', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin' })
  const electron = await import('electron')
  vi.mocked(electron.systemPreferences.getMediaAccessStatus).mockReturnValue('granted')
  vi.mocked(electron.systemPreferences.isTrustedAccessibilityClient).mockReturnValue(true)

  const { resolvePermissionGateSnapshot } = await import('../permission-gate/service')

  await expect(resolvePermissionGateSnapshot()).resolves.toEqual({
    platform: 'darwin',
    shouldGate: false,
    canEnterMainWindow: true,
    permissions: [
      expect.objectContaining({ key: 'microphone', status: 'granted' }),
      expect.objectContaining({ key: 'desktopControl', status: 'granted' })
    ]
  })
})
```

```tsx
test('refresh action stays on onboarding while permissions are still blocked', async () => {
  refresh.mockResolvedValueOnce({
    platform: 'darwin',
    shouldGate: true,
    canEnterMainWindow: false,
    permissions: [
      {
        key: 'microphone',
        title: 'Microphone',
        description: 'Required to capture your voice.',
        status: 'needs-manual-step'
      },
      {
        key: 'desktopControl',
        title: 'Desktop Control',
        description: 'Required to paste the final text into your current app.',
        status: 'needs-manual-step'
      }
    ]
  })

  const { PermissionOnboardingPage } = await import('../permissions')
  const user = userEvent.setup()
  render(<PermissionOnboardingPage />)

  await user.click(await screen.findByRole('button', { name: 'Refresh status' }))

  expect(refresh).toHaveBeenCalledTimes(1)
  expect(await screen.findAllByText('Not granted')).toHaveLength(2)
})
```

- [ ] **Step 2: Run the targeted regression tests before wiring the final refresh semantics**

Run: `pnpm --dir apps/desktop test src/main/__tests__/permission-gate.test.ts src/main/__tests__/window-manager.test.ts src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx`
Expected: FAIL on the new auto-advance coverage until the refresh path is fully wired

- [ ] **Step 3: Finish the refresh semantics and stabilize the blocked-state copy**

```ts
// apps/desktop/src/main/index.ts
async function refreshPermissionGateAndMaybeAdvance() {
  const snapshot = await resolvePermissionGateSnapshot()

  if (snapshot.canEnterMainWindow) {
    windowManager.closePermissionOnboarding()
    if (!windowManager.getMain()) {
      windowManager.createMain()
    }
    return snapshot
  }

  if (!windowManager.getPermissionOnboarding()) {
    windowManager.createPermissionOnboarding()
  }

  return snapshot
}
```

```tsx
// apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx
{snapshot?.permissions.some((item) => item.status === 'needs-manual-step') ? (
  <Alert>
    <AlertDescription>
      If you changed a setting in macOS System Settings, come back here and refresh. You may need to
      quit and reopen the app before the new state appears.
    </AlertDescription>
  </Alert>
) : null}
```

- [ ] **Step 4: Run the full targeted verification suite**

Run: `pnpm --dir apps/desktop test src/main/__tests__/permission-gate.test.ts src/main/__tests__/window-manager.test.ts src/preload/__tests__/index.test.ts src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx && pnpm --dir apps/desktop typecheck`
Expected: PASS for all targeted tests and both node/web typechecks

- [ ] **Step 5: Commit the end-to-end startup and onboarding verification**

```bash
git add \
  apps/desktop/src/main/__tests__/permission-gate.test.ts \
  apps/desktop/src/main/__tests__/window-manager.test.ts \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx \
  apps/desktop/src/renderer/src/pages/onboarding/__tests__/permissions.test.tsx
git commit -m "test(desktop): verify permission onboarding startup flow"
```

## Self-Review

### Spec Coverage

- macOS-only gating is covered by Task 1 and Task 2.
- required permissions `Microphone` and `Desktop Control` are covered by Task 1 and Task 4.
- dedicated onboarding window is covered by Task 2.
- preload IPC is covered by Task 3.
- shadcn-style `@openbroca/ui` renderer implementation is covered by Task 4.
- next-launch-only re-check behavior is preserved by Task 2 and Task 5 because no runtime ejection path is added to the main window.

### Placeholder Scan

- no `TODO`, `TBD`, or "implement later" placeholders remain
- each code-changing step includes concrete file paths and code
- each validation step includes an exact command and expected outcome

### Type Consistency

- the plan uses one normalized snapshot type across service, preload, and renderer
- permission keys remain `microphone` and `desktopControl` throughout
- IPC channel names stay aligned between main process and preload bridge
