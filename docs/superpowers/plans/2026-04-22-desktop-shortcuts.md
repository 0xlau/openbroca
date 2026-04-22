# Desktop Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop `Shortcuts` settings page, persist `quick` / `toHold` / `hold` shortcut settings, and wire the main-process capture flow so sustained listening can be entered and exited from both keyboard shortcuts and the floating listening window.

**Architecture:** Centralize shortcut defaults, normalization, and conflict validation in one shared helper used by both renderer persistence and main-process wiring. Extend the main shortcut input layer to emit three capture-related bindings, then keep the actual session semantics in `floating-session-controller` via a small `captureMode` state machine that also drives the floating-window confirm button.

**Tech Stack:** Electron, TypeScript, React 19, Zustand, TanStack Form, Vitest, Testing Library, uiohook-napi, Tailwind CSS 4

---

## File Structure

### New Files

- `apps/desktop/src/shared/shortcuts.ts`
  Owns shortcut defaults, normalization, primary-key extraction, and validation rules shared by renderer and main.
- `apps/desktop/src/shared/__tests__/shortcuts.test.ts`
  Verifies default shortcut hydration, normalization, and conflict detection.
- `apps/desktop/src/renderer/src/pages/main/shortcuts.tsx`
  Renders the new settings page, records user key input, validates conflicts, and persists the new shortcut shape.
- `apps/desktop/src/renderer/src/pages/main/__tests__/shortcuts.test.tsx`
  Covers route-level rendering, dirty-state save behavior, reset-to-defaults, and validation messaging.
- `apps/desktop/src/main/__tests__/shortcut-manager.test.ts`
  Covers the expanded low-level keyboard binding behavior for `quick`, `toHold`, and `hold`.

### Modified Files

- `apps/desktop/src/renderer/src/stores/shortcuts-store.ts`
  Imports the shared defaults and normalizer instead of keeping a renderer-only shortcut shape.
- `apps/desktop/src/renderer/src/components/nav-settings.tsx`
  Adds the `Shortcuts` entry to the settings navigation group.
- `apps/desktop/src/renderer/src/router/index.tsx`
  Adds the `/shortcuts` route.
- `apps/desktop/src/main/shortcut-manager.ts`
  Expands from a single accelerator listener into a capture-binding listener for `quick`, `toHold`, and `hold`.
- `apps/desktop/src/main/floating-session-controller.ts`
  Introduces `captureMode`, handles the new shortcut transitions, and exposes a single `finishCapture()` path for sustained listening stop actions.
- `apps/desktop/src/main/__tests__/floating-session-controller.test.ts`
  Covers the new mode transitions, `finishCapture()`, and updated shortcut rebinding shape.
- `apps/desktop/src/shared/listening-session-state.ts`
  Adds `captureMode` to the bridge state shared by main and renderer.
- `apps/desktop/src/main/index.ts`
  Reads the new shortcut settings shape, wires the updated controller handle, rebinds on store changes, and exposes `finish-capture` IPC.
- `apps/desktop/src/preload/index.ts`
  Exposes `finishCapture()` on `window.api.listeningSession`.
- `apps/desktop/src/preload/index.d.ts`
  Declares the new preload bridge method and the richer listening-session bridge type.
- `apps/desktop/src/preload/__tests__/index.test.ts`
  Verifies the new preload `finishCapture()` bridge.
- `apps/desktop/src/renderer/src/stores/listening-session-store.ts`
  Picks up the richer bridge type without adding renderer-local mode state.
- `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
  Shows the left-side confirm button for `latched` and `hold` modes and keeps the existing processing cancel button on the right.
- `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
  Covers the confirm-button visibility rules and its bridge action.

## Task 1: Centralize Shortcut Defaults And Validation

**Files:**
- Create: `apps/desktop/src/shared/shortcuts.ts`
- Create: `apps/desktop/src/shared/__tests__/shortcuts.test.ts`
- Modify: `apps/desktop/src/renderer/src/stores/shortcuts-store.ts`

- [ ] **Step 1: Write the failing shared shortcut tests**

```ts
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_SHORTCUT_SETTINGS,
  getShortcutPrimaryKey,
  normalizeShortcutSettings,
  validateShortcutSettings
} from '../shortcuts'

describe('shortcut settings helpers', () => {
  test('normalizes missing persisted values back to the new defaults', () => {
    expect(normalizeShortcutSettings(undefined)).toEqual(DEFAULT_SHORTCUT_SETTINGS)
    expect(normalizeShortcutSettings({ quickAccelerator: 'Option+Space' })).toEqual({
      quickAccelerator: 'Option+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Option+Shift+Space'
    })
  })

  test('extracts the primary key from an accelerator', () => {
    expect(getShortcutPrimaryKey('Option+Shift+Space')).toBe('Space')
    expect(getShortcutPrimaryKey('CommandOrControl+K')).toBe('K')
  })

  test('reports quick and hold conflicts plus toHold collisions', () => {
    expect(
      validateShortcutSettings({
        quickAccelerator: 'Option+Space',
        toHoldKey: 'Space',
        holdAccelerator: 'Option+Space'
      })
    ).toEqual([
      { field: 'holdAccelerator', message: 'Hold cannot use the same shortcut as Quick.' },
      { field: 'toHoldKey', message: 'To Hold cannot use the Quick trigger key.' }
    ])
  })
})
```

- [ ] **Step 2: Run the shared shortcut test to verify the helper module does not exist yet**

Run: `pnpm --dir apps/desktop test src/shared/__tests__/shortcuts.test.ts`
Expected: FAIL with `Cannot find module '../shortcuts'` or missing export errors for `DEFAULT_SHORTCUT_SETTINGS` and `validateShortcutSettings`

- [ ] **Step 3: Implement the shared shortcut helper and update the persisted store to use it**

```ts
// apps/desktop/src/shared/shortcuts.ts
export type ShortcutSettings = {
  quickAccelerator: string
  toHoldKey: string
  holdAccelerator: string
}

export type ShortcutValidationIssue = {
  field: keyof ShortcutSettings
  message: string
}

export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  quickAccelerator: 'Option+Space',
  toHoldKey: 'Tab',
  holdAccelerator: 'Option+Shift+Space'
}

export function normalizeShortcutSettings(raw: unknown): ShortcutSettings {
  const value = raw as Partial<ShortcutSettings> | null | undefined
  return {
    quickAccelerator: normalizeAccelerator(value?.quickAccelerator) ?? DEFAULT_SHORTCUT_SETTINGS.quickAccelerator,
    toHoldKey: normalizeSingleKey(value?.toHoldKey) ?? DEFAULT_SHORTCUT_SETTINGS.toHoldKey,
    holdAccelerator: normalizeAccelerator(value?.holdAccelerator) ?? DEFAULT_SHORTCUT_SETTINGS.holdAccelerator
  }
}

export function getShortcutPrimaryKey(accelerator: string): string | null {
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean)
  const last = parts.at(-1)
  return last ? normalizeSingleKey(last) : null
}

export function validateShortcutSettings(settings: ShortcutSettings): ShortcutValidationIssue[] {
  const issues: ShortcutValidationIssue[] = []
  const quickPrimaryKey = getShortcutPrimaryKey(settings.quickAccelerator)
  const holdPrimaryKey = getShortcutPrimaryKey(settings.holdAccelerator)

  if (settings.quickAccelerator === settings.holdAccelerator) {
    issues.push({ field: 'holdAccelerator', message: 'Hold cannot use the same shortcut as Quick.' })
  }

  if (quickPrimaryKey != null && settings.toHoldKey === quickPrimaryKey) {
    issues.push({ field: 'toHoldKey', message: 'To Hold cannot use the Quick trigger key.' })
  }

  if (holdPrimaryKey != null && settings.toHoldKey === holdPrimaryKey) {
    issues.push({ field: 'toHoldKey', message: 'To Hold cannot use the Hold trigger key.' })
  }

  return issues
}
```

```ts
// apps/desktop/src/renderer/src/stores/shortcuts-store.ts
import {
  DEFAULT_SHORTCUT_SETTINGS,
  normalizeShortcutSettings,
  type ShortcutSettings
} from '../../../shared/shortcuts'
import { createPersistedStore } from './create-persisted-store'

export { DEFAULT_SHORTCUT_SETTINGS as defaultShortcutSettings }
export type { ShortcutSettings } from '../../../shared/shortcuts'

export const shortcutsStore = createPersistedStore<ShortcutSettings>({
  key: 'shortcuts',
  defaults: DEFAULT_SHORTCUT_SETTINGS,
  normalize: normalizeShortcutSettings
})
```

- [ ] **Step 4: Run the shared shortcut test again**

Run: `pnpm --dir apps/desktop test src/shared/__tests__/shortcuts.test.ts`
Expected: PASS with `3 passed`

- [ ] **Step 5: Commit the shared shortcut model**

```bash
git add \
  apps/desktop/src/shared/shortcuts.ts \
  apps/desktop/src/shared/__tests__/shortcuts.test.ts \
  apps/desktop/src/renderer/src/stores/shortcuts-store.ts
git commit -m "feat(desktop): add shared shortcut settings model"
```

## Task 2: Build The Shortcuts Settings Page And Route

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/main/shortcuts.tsx`
- Create: `apps/desktop/src/renderer/src/pages/main/__tests__/shortcuts.test.tsx`
- Modify: `apps/desktop/src/renderer/src/components/nav-settings.tsx`
- Modify: `apps/desktop/src/renderer/src/router/index.tsx`

- [ ] **Step 1: Write failing renderer tests for the new settings page**

```tsx
// apps/desktop/src/renderer/src/pages/main/__tests__/shortcuts.test.tsx
test('includes shortcuts in settings navigation', async () => {
  const { NavSettings } = await import('../../../components/nav-settings')
  render(<NavSettings />)
  expect(screen.getByRole('link', { name: 'Shortcuts' })).toHaveAttribute('href', '#/shortcuts')
})

test('renders the three shortcut sections with persisted defaults', async () => {
  shortcutsStoreState.data = {
    quickAccelerator: 'Option+Space',
    toHoldKey: 'Tab',
    holdAccelerator: 'Option+Shift+Space'
  }

  const { Shortcuts } = await import('../shortcuts')
  render(<Shortcuts />)

  expect(screen.getByText('Shortcuts')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Option+Space')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Tab')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Option+Shift+Space')).toBeInTheDocument()
})

test('shows a validation error and disables save when hold matches quick', async () => {
  const { Shortcuts } = await import('../shortcuts')
  render(<Shortcuts />)

  await user.click(screen.getByLabelText('Hold shortcut'))
  await user.keyboard('{Alt>}{Space}{/Alt}')

  expect(screen.getByText('Hold cannot use the same shortcut as Quick.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

test('resets the editor values back to defaults without persisting immediately', async () => {
  shortcutsStoreState.data = {
    quickAccelerator: 'CommandOrControl+K',
    toHoldKey: 'F',
    holdAccelerator: 'Option+Shift+Space'
  }

  const { Shortcuts } = await import('../shortcuts')
  render(<Shortcuts />)

  await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))

  expect(screen.getByDisplayValue('Option+Space')).toBeInTheDocument()
  expect(update).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the renderer tests to confirm the page and route are missing**

Run: `pnpm --dir apps/desktop test src/renderer/src/pages/main/__tests__/shortcuts.test.tsx`
Expected: FAIL with `Cannot find module '../shortcuts'` and missing `Shortcuts` navigation assertions

- [ ] **Step 3: Implement the new page, local key-capture inputs, and route wiring**

```tsx
// apps/desktop/src/renderer/src/pages/main/shortcuts.tsx
function captureAccelerator(event: React.KeyboardEvent<HTMLInputElement>): string | null {
  event.preventDefault()
  const key = normalizeSingleKey(event.key)
  if (!key || ['Shift', 'Alt', 'Control', 'Meta'].includes(key)) {
    return null
  }

  const parts: string[] = []
  if (event.metaKey) parts.push('Command')
  if (event.ctrlKey && !event.metaKey) parts.push('Control')
  if (event.altKey) parts.push('Option')
  if (event.shiftKey) parts.push('Shift')
  parts.push(key)

  return parts.join('+')
}

export const Shortcuts: React.FC = () => {
  const { data: savedSettings, isHydrated, update } = useStore(shortcutsStore)
  const [draft, setDraft] = React.useState(savedSettings)

  React.useEffect(() => {
    if (isHydrated) {
      setDraft(savedSettings)
    }
  }, [isHydrated, savedSettings])

  const issues = validateShortcutSettings(draft)
  const issueMap = new Map(issues.map((issue) => [issue.field, issue.message]))
  const isDirty =
    isHydrated &&
    (
      draft.quickAccelerator !== savedSettings.quickAccelerator ||
      draft.toHoldKey !== savedSettings.toHoldKey ||
      draft.holdAccelerator !== savedSettings.holdAccelerator
    )

  return (
    <form className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6" onSubmit={(event) => {
      event.preventDefault()
      if (issues.length > 0 || !isDirty) return
      void update(draft)
    }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TypographyH3 className="text-left">Shortcuts</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Configure Quick, To Hold, and Hold capture shortcuts.
          </TypographyMuted>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setDraft(DEFAULT_SHORTCUT_SETTINGS)}>
            Reset to defaults
          </Button>
          {isDirty ? (
            <Button type="submit" disabled={issues.length > 0}>
              Save changes
            </Button>
          ) : null}
        </div>
      </div>
      {/* three labeled fields using readonly Input and onKeyDown capture */}
    </form>
  )
}
```

```ts
// apps/desktop/src/renderer/src/router/index.tsx
import { Shortcuts } from '@renderer/pages/main/shortcuts'

{ path: 'shortcuts', Component: Shortcuts }
```

```ts
// apps/desktop/src/renderer/src/components/nav-settings.tsx
{
  name: 'Shortcuts',
  url: '/shortcuts',
  icon: <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
}
```

- [ ] **Step 4: Run the shortcuts page tests and one existing settings-page regression**

Run: `pnpm --dir apps/desktop test src/renderer/src/pages/main/__tests__/shortcuts.test.tsx src/renderer/src/pages/main/__tests__/prompts.test.tsx`
Expected: PASS with the new `Shortcuts` cases green and the existing `Prompts` page still passing

- [ ] **Step 5: Commit the renderer page and navigation changes**

```bash
git add \
  apps/desktop/src/renderer/src/pages/main/shortcuts.tsx \
  apps/desktop/src/renderer/src/pages/main/__tests__/shortcuts.test.tsx \
  apps/desktop/src/renderer/src/components/nav-settings.tsx \
  apps/desktop/src/renderer/src/router/index.tsx
git commit -m "feat(desktop): add shortcuts settings page"
```

## Task 3: Extend The Low-Level Shortcut Manager For Three Capture Bindings

**Files:**
- Modify: `apps/desktop/src/main/shortcut-manager.ts`
- Create: `apps/desktop/src/main/__tests__/shortcut-manager.test.ts`

- [ ] **Step 1: Write failing low-level keyboard binding tests**

```ts
test('fires quick down and quick up for the configured accelerator', async () => {
  const { shortcutManager } = await import('../shortcut-manager')
  const onQuickDown = vi.fn()
  const onQuickUp = vi.fn()

  shortcutManager.startCaptureBindings({
    quickAccelerator: 'Option+Space',
    toHoldKey: 'Tab',
    holdAccelerator: 'Option+Shift+Space',
    onQuickDown,
    onQuickUp,
    onToHoldDown: vi.fn(),
    onHoldDown: vi.fn()
  })

  emitKeydown({ keycode: UiohookKey.Space, altKey: true })
  emitKeyup({ keycode: UiohookKey.Space, altKey: true })

  expect(onQuickDown).toHaveBeenCalledTimes(1)
  expect(onQuickUp).toHaveBeenCalledTimes(1)
})

test('fires toHold on keydown without requiring a keyup callback', async () => {
  const { shortcutManager } = await import('../shortcut-manager')
  const onToHoldDown = vi.fn()

  shortcutManager.startCaptureBindings({
    quickAccelerator: 'Option+Space',
    toHoldKey: 'Tab',
    holdAccelerator: 'Option+Shift+Space',
    onQuickDown: vi.fn(),
    onQuickUp: vi.fn(),
    onToHoldDown,
    onHoldDown: vi.fn()
  })

  emitKeydown({ keycode: UiohookKey.Tab })

  expect(onToHoldDown).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the shortcut-manager test to verify the new API is missing**

Run: `pnpm --dir apps/desktop test src/main/__tests__/shortcut-manager.test.ts`
Expected: FAIL with `Property 'startCaptureBindings' does not exist on type 'ShortcutManager'`

- [ ] **Step 3: Implement multi-binding parsing and dispatch in `shortcut-manager.ts`**

```ts
type CaptureShortcutBindings = {
  quickAccelerator: string
  toHoldKey: string
  holdAccelerator: string
  onQuickDown: () => void
  onQuickUp: () => void
  onToHoldDown: () => void
  onHoldDown: () => void
}

class ShortcutManager {
  private quickParsed: ParsedAccelerator | null = null
  private holdParsed: ParsedAccelerator | null = null
  private toHoldKeyCode: number | null = null
  private onQuickDown: (() => void) | null = null
  private onQuickUp: (() => void) | null = null
  private onToHoldDown: (() => void) | null = null
  private onHoldDown: (() => void) | null = null
  private quickIsDown = false

  startCaptureBindings(bindings: CaptureShortcutBindings): void {
    this.quickParsed = parseAccelerator(bindings.quickAccelerator)
    this.holdParsed = parseAccelerator(bindings.holdAccelerator)
    this.toHoldKeyCode = parseSingleKey(bindings.toHoldKey)
    this.onQuickDown = bindings.onQuickDown
    this.onQuickUp = bindings.onQuickUp
    this.onToHoldDown = bindings.onToHoldDown
    this.onHoldDown = bindings.onHoldDown
    this.ensureStarted()
  }

  updateCaptureBindings(next: Pick<CaptureShortcutBindings, 'quickAccelerator' | 'toHoldKey' | 'holdAccelerator'>): void {
    this.quickParsed = parseAccelerator(next.quickAccelerator)
    this.holdParsed = parseAccelerator(next.holdAccelerator)
    this.toHoldKeyCode = parseSingleKey(next.toHoldKey)
    this.quickIsDown = false
  }

  private handleKeydown = (event: UiohookKeyboardEvent): void => {
    if (matchesAccelerator(event, this.quickParsed)) {
      if (!this.quickIsDown) {
        this.quickIsDown = true
        this.onQuickDown?.()
      }
      return
    }
    if (matchesAccelerator(event, this.holdParsed)) {
      this.onHoldDown?.()
      return
    }
    if (event.keycode === this.toHoldKeyCode) {
      this.onToHoldDown?.()
    }
  }

  private handleKeyup = (event: UiohookKeyboardEvent): void => {
    if (this.quickIsDown && this.quickParsed && event.keycode === this.quickParsed.keyCode) {
      this.quickIsDown = false
      this.onQuickUp?.()
    }
  }
}
```

- [ ] **Step 4: Run the shortcut-manager tests again**

Run: `pnpm --dir apps/desktop test src/main/__tests__/shortcut-manager.test.ts`
Expected: PASS with the new binding API covered

- [ ] **Step 5: Commit the low-level keyboard binding update**

```bash
git add \
  apps/desktop/src/main/shortcut-manager.ts \
  apps/desktop/src/main/__tests__/shortcut-manager.test.ts
git commit -m "feat(desktop): add multi-binding shortcut manager"
```

## Task 4: Add Capture Modes And Sustained-Listening Stop Semantics

**Files:**
- Modify: `apps/desktop/src/shared/listening-session-state.ts`
- Modify: `apps/desktop/src/main/floating-session-controller.ts`
- Modify: `apps/desktop/src/main/__tests__/floating-session-controller.test.ts`

- [ ] **Step 1: Write failing controller tests for `latched`, `hold`, and `finishCapture()`**

```ts
test('latches capture when toHold is pressed during quick capture and ignores the later quick keyup', async () => {
  const controller = bindFloatingSessionController({
    shortcutSettings: {
      quickAccelerator: 'Option+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Option+Shift+Space'
    },
    listeningSession,
    shortcutManager,
    windowManager
  })

  const [{ onQuickDown, onQuickUp, onToHoldDown }] = shortcutManager.startCaptureBindings.mock.calls

  currentState = { state: { status: 'idle' }, targetApp: null, captureMode: null }
  onQuickDown()

  currentState = { state: { status: 'listening' }, targetApp: null, captureMode: 'quick' }
  onToHoldDown()
  onQuickUp()

  expect(listeningSession.start).toHaveBeenCalledTimes(1)
  expect(listeningSession.stop).not.toHaveBeenCalled()

  controller.finishCapture()

  expect(listeningSession.stop).toHaveBeenCalledTimes(1)
})

test('toggles hold mode from idle and back to idle on the next hold keydown', async () => {
  bindFloatingSessionController({
    shortcutSettings: {
      quickAccelerator: 'Option+Space',
      toHoldKey: 'Tab',
      holdAccelerator: 'Option+Shift+Space'
    },
    listeningSession,
    shortcutManager,
    windowManager
  })

  const [{ onHoldDown }] = shortcutManager.startCaptureBindings.mock.calls

  currentState = { state: { status: 'idle' }, targetApp: null, captureMode: null }
  onHoldDown()

  currentState = { state: { status: 'listening' }, targetApp: null, captureMode: 'hold' }
  onHoldDown()

  expect(listeningSession.start).toHaveBeenCalledTimes(1)
  expect(listeningSession.stop).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the floating-session-controller test to verify the new bindings and bridge shape are not implemented yet**

Run: `pnpm --dir apps/desktop test src/main/__tests__/floating-session-controller.test.ts`
Expected: FAIL with missing `shortcutSettings`, `captureMode`, and `finishCapture()` API errors

- [ ] **Step 3: Implement `captureMode` on the shared bridge type and the controller state machine**

```ts
// apps/desktop/src/shared/listening-session-state.ts
export type ListeningCaptureMode = 'quick' | 'latched' | 'hold' | null

export type ListeningSessionBridgeState = {
  state: ListeningSessionState
  targetApp: AppIdentity | null
  captureMode: ListeningCaptureMode
}

export const INITIAL_LISTENING_SESSION_BRIDGE_STATE: ListeningSessionBridgeState = {
  state: { status: 'idle' },
  targetApp: null,
  captureMode: null
}
```

```ts
// apps/desktop/src/main/floating-session-controller.ts
export function bindFloatingSessionController(options: BindFloatingSessionControllerOptions) {
  let captureMode: ListeningCaptureMode = null

  function startCapture(nextMode: Exclude<ListeningCaptureMode, null>) {
    const deviceId = options.getSelectedDeviceId?.()
    captureMode = nextMode
    options.listeningSession.start(deviceId == null ? undefined : { deviceId })
  }

  function finishCapture() {
    if (!isCaptureActive(options.listeningSession.getState().state.status)) {
      return
    }
    captureMode = null
    options.listeningSession.stop()
  }

  options.shortcutManager.startCaptureBindings({
    ...options.shortcutSettings,
    onQuickDown: () => {
      if (options.listeningSession.getState().state.status === 'error') {
        options.listeningSession.stop()
      }
      if (options.listeningSession.getState().state.status === 'idle') {
        startCapture('quick')
        return
      }
      if (captureMode === 'latched') {
        finishCapture()
      }
    },
    onQuickUp: () => {
      if (captureMode === 'quick') {
        finishCapture()
      }
    },
    onToHoldDown: () => {
      if (captureMode === 'quick') {
        captureMode = 'latched'
      }
    },
    onHoldDown: () => {
      if (options.listeningSession.getState().state.status === 'idle') {
        startCapture('hold')
      } else if (captureMode === 'hold') {
        finishCapture()
      }
    }
  })

  return {
    finishCapture,
    updateShortcuts(nextSettings: ShortcutSettings) {
      options.shortcutManager.updateCaptureBindings(nextSettings)
    },
    dispose() {
      unsubscribe()
      options.windowManager.setFloatingHiddenHandler(null)
    }
  }
}
```

- [ ] **Step 4: Run the updated controller tests**

Run: `pnpm --dir apps/desktop test src/main/__tests__/floating-session-controller.test.ts`
Expected: PASS with the new `latched`, `hold`, and `finishCapture()` cases green

- [ ] **Step 5: Commit the capture-mode controller changes**

```bash
git add \
  apps/desktop/src/shared/listening-session-state.ts \
  apps/desktop/src/main/floating-session-controller.ts \
  apps/desktop/src/main/__tests__/floating-session-controller.test.ts
git commit -m "feat(desktop): add sustained capture modes"
```

## Task 5: Wire IPC, Floating UI, And End-To-End Desktop Verification

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/preload/__tests__/index.test.ts`
- Modify: `apps/desktop/src/renderer/src/stores/listening-session-store.ts`
- Modify: `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`

- [ ] **Step 1: Write failing bridge and floating-window tests**

```ts
// apps/desktop/src/preload/__tests__/index.test.ts
test('finishes sustained capture through the main-process bridge', async () => {
  enableContextIsolation()
  await import('../index')

  const api = getExposedApi()
  await api.listeningSession.finishCapture()

  expect(invoke).toHaveBeenCalledWith('listening-session:finish-capture')
})
```

```tsx
// apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx
test('shows a confirm button for latched listening and calls finishCapture when clicked', async () => {
  const finishCapture = vi.fn().mockResolvedValue(undefined)
  const { container } = await renderForBridgeState(
    {
      state: { status: 'listening' },
      targetApp: null,
      captureMode: 'latched'
    },
    { finishCapture }
  )

  await waitFor(() => {
    expect(within(container).getByRole('button', { name: 'Finish capture' })).toBeTruthy()
  })

  within(container).getByRole('button', { name: 'Finish capture' }).click()

  await waitFor(() => {
    expect(finishCapture).toHaveBeenCalledTimes(1)
  })
})

test('keeps the confirm button hidden during quick capture and processing', async () => {
  const { container, emit } = await renderForBridgeState({
    state: { status: 'listening' },
    targetApp: null,
    captureMode: 'quick'
  })

  await waitFor(() => {
    expect(within(container).queryByRole('button', { name: 'Finish capture' })).toBeNull()
  })

  emit({
    state: { status: 'processing' },
    targetApp: null,
    captureMode: null
  })

  await waitFor(() => {
    expect(within(container).queryByRole('button', { name: 'Finish capture' })).toBeNull()
    expect(within(container).getByRole('button')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the preload and floating-window tests to confirm the new stop path is not wired**

Run: `pnpm --dir apps/desktop test src/preload/__tests__/index.test.ts src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: FAIL with missing `finishCapture()` bridge methods and missing `captureMode` properties on the mocked bridge state

- [ ] **Step 3: Implement the IPC bridge, rebind logic, and floating confirm button**

```ts
// apps/desktop/src/main/index.ts
import { normalizeShortcutSettings } from '../shared/shortcuts'

let floatingSessionController: ReturnType<typeof bindFloatingSessionController> | null = null

function getShortcutSettings(): ShortcutSettings {
  return normalizeShortcutSettings(store.get('shortcuts'))
}

ipcMain.handle('listening-session:finish-capture', () => floatingSessionController?.finishCapture())

floatingSessionController = bindFloatingSessionController({
  shortcutSettings: getShortcutSettings(),
  getSelectedDeviceId: () => {
    const mic = store.get('microphone') as { selectedDeviceId?: number | null } | undefined
    return mic?.selectedDeviceId
  },
  listeningSession,
  shortcutManager,
  windowManager
})

store.onDidChange('shortcuts', () => {
  floatingSessionController?.updateShortcuts(getShortcutSettings())
})
```

```ts
// apps/desktop/src/preload/index.ts
listeningSession: {
  cancelProcessing: () => ipcRenderer.invoke('listening-session:cancel-processing') as Promise<void>,
  finishCapture: () => ipcRenderer.invoke('listening-session:finish-capture') as Promise<void>,
  getState: () => ipcRenderer.invoke('listening-session:get-state') as Promise<ListeningSessionBridgeState>,
  onStateChange: (callback) => { /* unchanged listener wiring */ }
}
```

```tsx
// apps/desktop/src/renderer/src/pages/float/float-listening.tsx
const showFinishCapture =
  state.status === 'listening' && (bridge.captureMode === 'latched' || bridge.captureMode === 'hold')

return (
  <div className={cn('flex gap-2', showProcessing && 'w-full max-w-full')}>
    {showFinishCapture ? (
      <Button
        aria-label="Finish capture"
        className="shrink-0"
        size="icon"
        variant="secondary"
        onClick={() => void window.api.listeningSession.finishCapture()}
      >
        <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
      </Button>
    ) : null}
    <div className={cn(/* existing waveform / processing shell */)}>{/* existing content */}</div>
    {showCancel ? (
      <Button
        aria-label="Cancel processing"
        className="shrink-0"
        size="icon"
        variant="secondary"
        onClick={() => void window.api.listeningSession.cancelProcessing()}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    ) : null}
  </div>
)
```

- [ ] **Step 4: Run the targeted regression suite and the desktop typecheck**

Run: `pnpm --dir apps/desktop test src/shared/__tests__/shortcuts.test.ts src/main/__tests__/shortcut-manager.test.ts src/main/__tests__/floating-session-controller.test.ts src/preload/__tests__/index.test.ts src/renderer/src/pages/main/__tests__/shortcuts.test.tsx src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: PASS with all six targeted files green

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS with no TypeScript errors in `main`, `preload`, or `renderer`

- [ ] **Step 5: Commit the bridge and floating-window integration**

```bash
git add \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/preload/index.ts \
  apps/desktop/src/preload/index.d.ts \
  apps/desktop/src/preload/__tests__/index.test.ts \
  apps/desktop/src/renderer/src/stores/listening-session-store.ts \
  apps/desktop/src/renderer/src/pages/float/float-listening.tsx \
  apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx
git commit -m "feat(desktop): wire sustained capture controls"
```

## Self-Review

- Spec coverage:
  - `/shortcuts` page, settings navigation, and defaults are covered by Task 2.
  - Shared shortcut normalization and conflict validation are covered by Task 1.
  - Main-process `quick` / `toHold` / `hold` semantics are covered by Tasks 3 and 4.
  - Floating confirm-button visibility and IPC stop behavior are covered by Task 5.
  - Store-change rebinding and bridge typing are covered by Tasks 4 and 5.
- Placeholder scan:
  - No `TODO`, `TBD`, or "similar to previous task" placeholders remain.
  - Each task includes exact file paths, code snippets, commands, and commit messages.
- Type consistency:
  - `ShortcutSettings`, `ListeningCaptureMode`, `finishCapture()`, `startCaptureBindings()`, and `updateShortcuts()` are named consistently across all tasks.
