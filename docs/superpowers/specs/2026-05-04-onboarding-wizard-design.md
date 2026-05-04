# Onboarding Wizard Design

**Date:** 2026-05-04

## Goal

Replace the single-page permission onboarding window with a three-step first-run wizard that walks the user through:

1. **Permissions** — microphone + accessibility (existing flow, refactored)
2. **Providers** — connect at least one LLM and one ASR
3. **Shortcuts tutorial** — teach `Quick`(double-tap ⌘) and `Hold`(⌘+Space), with live key-press detection and a mock floating-window demo so the user *feels* what using the app is like.

The wizard is **strict first-run only**: once the user finishes it, subsequent launches skip the wizard. Permission revocation still re-gates the user (existing behavior, unchanged), but does not re-trigger the providers/shortcuts steps. Provider/shortcut state changes never reopen the wizard.

## Scope

This design covers:

- `apps/desktop` only
- A new `OnboardingShell` (renderer) with stepper, back/next, and route-driven step rendering
- Curated mini-picker for the provider step (reuses the existing `ProviderConnectDialog` and `ProviderSettingsDialog`)
- Sub-step shortcut tutorial (Quick → Hold) with in-window keydown detection and a `FloatListening`-styled mock demo overlay
- Persisted `onboarding.completedAt` flag
- Renaming `permission-gate/` → `onboarding-gate/` and broadening its snapshot to drive both first-run and permission-recovery modes
- IPC channel rename `permissions:state-changed` → `onboarding:state-changed`

This design does **not** cover:

- Localizing copy beyond the existing language baseline
- Reopening the wizard from settings ("re-run onboarding")
- Per-step `completedAt` tracking — only a single overall flag
- Re-gating users after they revoke a provider or change a shortcut
- Embedded model-download progress for Sherpa-ONNX inside the onboarding card (we link out to the existing settings dialog instead)
- A new E2E test framework

## Confirmed Product Decisions

- Provider step uses **curated mini-picker** (3-4 featured LLMs, 2 featured ASRs) with a "+ 全部" collapsible reveal of the full list.
- Shortcut tutorial uses **sub-step split** (Quick first, Hold second) with **in-window keydown/keyup detection** (no involvement of the global shortcut manager).
- **Strict first-run** persistence: a single `completedAt: number | null` field; no re-entry once set.
- Demo uses a **mock floating-window overlay** rendered inside the onboarding window (no new BrowserWindow), copying `FloatListening`'s visual language and driven by mock state.

## Architecture

### File structure

```
apps/desktop/src/main/
  onboarding-gate/                    ← renamed from permission-gate/
    types.ts                          ← extended snapshot
    macos.ts                          ← unchanged
    service.ts                        ← reads store, decides mode
    watcher.ts                        ← class renamed OnboardingWatcher
    __tests__/
      service.test.ts                 ← decision-table coverage
      watcher.test.ts                 ← inherited from PermissionWatcher tests

apps/desktop/src/main/windows/
  onboarding-window.ts                ← renamed; mode-aware initial route

apps/desktop/src/main/
  index.ts                            ← rename functions, subscribe to store change
  __tests__/
    onboarding-gate.test.ts           ← inherits permission-gate.test.ts cases

apps/desktop/src/preload/
  index.ts                            ← IPC channel rename only
  index.d.ts                          ← onStateChange signature unchanged
  __tests__/index.test.ts             ← channel string change

apps/desktop/src/shared/
  onboarding.ts                       ← state type + defaults + normalize

apps/desktop/src/renderer/src/stores/
  onboarding-store.ts                 ← persisted store wrapper

apps/desktop/src/renderer/src/pages/onboarding/
  shell.tsx                           ← stepper, nav, step-state
  steps/
    permissions-step.tsx              ← refactor of permissions.tsx body
    providers-step.tsx                ← curated picker
    shortcuts-step.tsx                ← sub-step container + detection
    shortcuts-demo.tsx                ← mock floating overlay
  __tests__/
    shell.test.tsx
  steps/__tests__/
    permissions-step.test.tsx         ← migrated from permissions.test.tsx
    providers-step.test.tsx
    shortcuts-step.test.tsx
    shortcuts-demo.test.tsx

apps/desktop/src/renderer/src/router/index.tsx  ← nested routes under /onboarding
```

### Routing

```
/onboarding                            → OnboardingShell (with <Outlet />)
  ├── /onboarding/permissions          → PermissionsStep
  ├── /onboarding/providers            → ProvidersStep
  └── /onboarding/shortcuts            → ShortcutsStep
```

`OnboardingShell` reads `useSearchParams()`; if `?variant=recovery` is present on the permissions step, render only the standalone permissions UI (no stepper, no nav, no providers/shortcuts routes). This keeps the recovery-after-revocation flow visually identical to the current standalone permissions onboarding.

### Step contract

`OnboardingShell` always calls all three step-ready hooks unconditionally (Rules of Hooks) and dispatches the relevant flag based on the active route. Each step exports its hook:

```ts
// permissions-step.tsx
export function usePermissionsStepReady(snapshot: OnboardingGateSnapshot | null): boolean {
  return snapshot?.permissionsOk === true
}

// providers-step.tsx
export function useProvidersStepReady(): boolean {
  const { data } = useStore(providerStore)
  return Boolean(data.activeProviders.llm) && Boolean(data.activeProviders.asr)
}

// shortcuts-step.tsx
// Internal "both sub-steps done" lives in a small zustand store local to the module
// (NOT persisted); the hook reads from it. This keeps shell-side hook calls unconditional
// while letting the step component drive the value.
export function useShortcutsStepReady(): boolean { /* read from local module store */ }
```

In the shell:

```ts
// shell.tsx
const permissionsReady = usePermissionsStepReady(snapshot)
const providersReady = useProvidersStepReady()
const shortcutsReady = useShortcutsStepReady()

const currentStepReady =
  pathname.endsWith('/permissions') ? permissionsReady :
  pathname.endsWith('/providers')   ? providersReady :
                                       shortcutsReady
```

The shell keeps no per-step state of its own; it derives "first incomplete step" by walking the three flags in order and stopping at the first false. On hard refresh that's where the user lands.

## Persistence

### `OnboardingState`

```ts
// apps/desktop/src/shared/onboarding.ts
export interface OnboardingState {
  completedAt: number | null
}

export const defaultOnboardingState: OnboardingState = { completedAt: null }

export function normalizeOnboardingState(raw: unknown): OnboardingState {
  if (raw == null || typeof raw !== 'object') return defaultOnboardingState
  const value = raw as Partial<OnboardingState>
  if (typeof value.completedAt === 'number') return { completedAt: value.completedAt }
  return { completedAt: null }
}
```

```ts
// apps/desktop/src/renderer/src/stores/onboarding-store.ts
export const onboardingStore = createPersistedStore<OnboardingState>({
  key: 'onboarding',
  defaults: defaultOnboardingState,
  normalize: normalizeOnboardingState
})

export async function markOnboardingComplete(): Promise<void> {
  await onboardingStore.getState().replace({ completedAt: Date.now() })
}
```

## Onboarding Gate

### Snapshot

```ts
type OnboardingMode = 'first-run' | 'permission-recovery' | 'none'

type OnboardingGateSnapshot = {
  mode: OnboardingMode
  canEnterMainWindow: boolean
  permissionsOk: boolean
  hasCompletedOnboarding: boolean
  permissions: PermissionItem[]    // unchanged shape, used by PermissionsStep
}
```

### Decision table

| `hasCompletedOnboarding` | `permissionsOk` | `mode`               | `canEnterMainWindow` |
|---|---|---|---|
| false | * | `first-run` | false |
| true  | true | `none` | true |
| true  | false | `permission-recovery` | false |

### `resolveOnboardingGateSnapshot()`

```ts
export async function resolveOnboardingGateSnapshot(
  readStore: () => OnboardingState  // injected; production passes store.get('onboarding')
): Promise<OnboardingGateSnapshot> {
  const permissions = process.platform === 'darwin'
    ? [resolveMacMicrophonePermission(), resolveMacDesktopControlPermission()]
    : []
  const permissionsOk = process.platform !== 'darwin'
    || permissions.every((p) => p.status === 'granted')
  const hasCompletedOnboarding = readStore().completedAt !== null

  let mode: OnboardingMode
  let canEnter: boolean
  if (!hasCompletedOnboarding) {
    mode = 'first-run'; canEnter = false
  } else if (permissionsOk) {
    mode = 'none'; canEnter = true
  } else {
    mode = 'permission-recovery'; canEnter = false
  }

  return { mode, canEnterMainWindow: canEnter, permissionsOk, hasCompletedOnboarding, permissions }
}
```

`readStore` is injected so service tests stay pure. In production the main process passes `() => normalizeOnboardingState(store.get('onboarding'))`.

### Watcher

`OnboardingWatcher` is `PermissionWatcher` renamed. Internal logic is unchanged — focus listener, blur, 1500ms poll, JSON-diff snapshot suppression, isTicking guard, console.warn on errors. The `resolve` callback now points at `resolveOnboardingGateSnapshot()` instead of the permission resolver.

### Store change subscription

In `app.whenReady`, subscribe once to `store.onDidChange('onboarding', ...)`. Callback fires `refreshOnboardingGateAndMaybeAdvance()` immediately (non-debounced; the only writer is `markOnboardingComplete`, called once). This is what closes the onboarding window and opens the main window the moment Step 3 finishes — without waiting for the next watcher tick.

## Window Lifecycle

`ensureOnboardingWindow(snapshot)`:

```ts
function ensureOnboardingWindow(snapshot: OnboardingGateSnapshot): void {
  if (snapshot.mode === 'none') return

  const existing = windowManager.getOnboarding()
  if (existing && !existing.isDestroyed()) return

  const win = windowManager.createOnboarding(snapshot.mode)
  const watcher = new OnboardingWatcher({
    resolve: () => resolveOnboardingGateSnapshot(() => normalizeOnboardingState(store.get('onboarding'))),
    pushSnapshot: (next) => {
      if (!win.isDestroyed()) win.webContents.send('onboarding:state-changed', next)
    },
    onMaybeAdvance: refreshOnboardingGateAndMaybeAdvance
  })
  watcher.start(win)

  win.on('closed', () => {
    watcher.stop()
    if (!windowManager.getMain()) app.quit()
  })
}
```

`windowManager.createOnboarding(mode)`:

| `mode` | hash loaded |
|---|---|
| `first-run` | `#/onboarding/permissions` |
| `permission-recovery` | `#/onboarding/permissions?variant=recovery` |

`refreshOnboardingGateAndMaybeAdvance()` mirrors today's permission-gate version: if `canEnterMainWindow` flips true, ensure capture entry points, create main window, close onboarding, return snapshot.

## Step 2 — Providers (curated mini-picker)

### Featured lists (compile-time constants)

```ts
const FEATURED_LLM_IDS = ['openai-codex', 'openrouter']
const FEATURED_ASR_IDS = ['deepgram', 'sherpa-onnx']
```

### Layout

- Heading: "连接你的大脑和耳朵 · 挑一个语音识别和一个语言模型。可以之后再换。"
- Two sections: 🧠 Language Model, 🎤 Speech Recognition
- Each section: card grid showing featured providers, plus a "+ 全部 ⌄" button that toggles a Collapsible revealing the rest
- Footer (above shell nav): live status text — "请连接一个 LLM 和一个 ASR 才能继续" / "✓ 准备就绪"

### `OnboardingProviderCard`

- Provider icon (`HugeiconsIcon` + provider's icon)
- Name + one-line descriptor description
- Status badge: not connected / connected / active
- Primary button:
  - not connected → "Connect" → opens `ProviderConnectDialog`
  - connected, not active → "设为默认"
  - active → disabled "已选用"
- Secondary action (small gear, only when connected): opens `ProviderSettingsDialog` (for Sherpa-ONNX this is also the model-download UI)

### Auto-active behavior

When the user successfully connects a provider AND that domain (`llm` or `asr`) currently has no active value, set the new connection as active automatically. If a value already exists, do not steal — surface "设为默认" instead.

```ts
async function handleConnectionSuccess(domain: 'llm' | 'asr', providerId: string): Promise<void> {
  const current = providerStore.getState().data.activeProviders
  if (current[domain]) return
  await providerStore.getState().update({ activeProviders: { ...current, [domain]: providerId } })
}
```

### Sherpa-ONNX (local ASR)

The card opens `ProviderSettingsDialog` (existing) which already handles model listing/download. We do not embed a progress bar inline.

Primary button text:

| State | Button text |
|---|---|
| no model downloaded yet | `下载并连接` |
| model downloaded but provider not connected | `Connect` |
| connected but not active | `设为默认` |
| connected and active | `已选用` (disabled) |

In all states except the last, clicking opens `ProviderSettingsDialog`; the dialog's existing flow handles model download and connection. After the user completes setup, the card refreshes via the existing tRPC query invalidation. Detecting "no model downloaded" reuses the existing `trpc.providers.localModels.list` query (or whatever the current local-model status query is named — confirmed during plan).

### Gate

```ts
export function useProvidersStepReady(): boolean {
  const { data } = useStore(providerStore)
  return Boolean(data.activeProviders.llm) && Boolean(data.activeProviders.asr)
}
```

## Step 3 — Shortcuts tutorial

### Sub-step state

```ts
type SubStep = 'quick' | 'hold'
type SubStepState = 'idle' | 'detecting' | 'detected' | 'demo-playing' | 'done'
```

`shortcuts-step.tsx` owns `currentSubStep: SubStep` and `currentSubStepState: SubStepState`. When `quick` reaches `done`, switch to `hold` with state `idle`. When `hold` reaches `done`, the step is complete; the shell's Continue button activates with text "进入 OpenBroca →".

On clicking "进入 OpenBroca", call `markOnboardingComplete()`. The store change fires the main-process subscription, which closes the onboarding window and opens the main window.

### Detection — Quick (double-tap ⌘)

```ts
function useQuickTapDetection(opts: {
  active: boolean
  modifierKey: 'Meta' | 'Control'
  onDetected: () => void
}): void {
  React.useEffect(() => {
    if (!opts.active) return

    let firstDownAt: number | null = null
    const QUICK_GAP_MS = 300

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== opts.modifierKey) return
      if (e.repeat) return  // ignore OS auto-repeat
      const now = performance.now()
      if (firstDownAt !== null && now - firstDownAt <= QUICK_GAP_MS) {
        opts.onDetected()
        firstDownAt = null
        return
      }
      firstDownAt = now
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [opts.active, opts.modifierKey, opts.onDetected])
}
```

### Detection — Hold (⌘+Space, 500ms+)

```ts
function useHoldDetection(opts: {
  active: boolean
  modifierKey: 'Meta' | 'Control'
  onDetected: () => void
}): void {
  React.useEffect(() => {
    if (!opts.active) return

    const HOLD_MIN_MS = 500
    let modifierDownAt: number | null = null
    let bothDownAt: number | null = null

    function onKeyDown(e: KeyboardEvent): void {
      if (e.repeat) return
      if (e.key === opts.modifierKey) {
        if (modifierDownAt === null) modifierDownAt = performance.now()
      } else if (e.key === ' ' || e.code === 'Space') {
        if (modifierDownAt !== null && bothDownAt === null) bothDownAt = performance.now()
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      const isModifier = e.key === opts.modifierKey
      const isSpace = e.key === ' ' || e.code === 'Space'
      if (!isModifier && !isSpace) return
      if (bothDownAt !== null && performance.now() - bothDownAt >= HOLD_MIN_MS) {
        opts.onDetected()
      }
      modifierDownAt = null
      bothDownAt = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [opts.active, opts.modifierKey, opts.onDetected])
}
```

When `opts.active` is false the hooks attach no listeners — guarantees the inactive sub-step's detector cannot fire.

### Modifier key resolution

`useModifierKey()` returns `'Meta'` on macOS, `'Control'` elsewhere. Read from `window.electron.process.platform` (already exposed) or fall back to `navigator.platform`.

### Keyboard animation (visual)

Pure CSS keyframes on `<KeyCap>⌘</KeyCap>` elements. Quick: two keys side-by-side, alternating `down→up→pause→down→up` on a 1.6s loop. Hold: ⌘ + + + Space rendered inline; ⌘+Space share a "pressed" state held for 800ms each loop, with a subtle glow effect during hold.

No animation library beyond what's already imported (`motion` / Tailwind keyframes).

### Demo overlay

`shortcuts-demo.tsx` is mounted as an absolute-positioned overlay over the step container (parent: `relative`). Stages:

```
listening   → 1.0s   pulsing mic icon + animated waveform bars
transcribing → 0.6s  spinner + "Transcribing..."
pasted       → 1.4s  ✓ + the mock transcript + small toast "Pasted to your active app"
```

Uses `motion`'s `AnimatePresence` to fade between stages (matching `FloatListening`'s visual language). After `pasted` completes, fade out the whole overlay and call `props.onComplete()`. `useEffect`-driven `setTimeout` chain; cleanup cancels timeouts on unmount.

Mock transcripts (per sub-step):
- Quick: `"Hello, OpenBroca."`
- Hold: `"Long-press lets me dictate longer thoughts before I let go."`

## IPC

| Channel | Direction | Purpose |
|---|---|---|
| `permissions:get-snapshot` | renderer → main | unchanged — returns `OnboardingGateSnapshot` (renderer ignores `mode`/`hasCompletedOnboarding` in the permissions step) |
| `permissions:request-microphone` | renderer → main | unchanged |
| `permissions:open-desktop-control-settings` | renderer → main | unchanged |
| `permissions:refresh` | renderer → main | unchanged — re-resolves the snapshot |
| `permissions:quit-app` | renderer → main | unchanged |
| `onboarding:state-changed` | main → renderer | **renamed** from `permissions:state-changed`; payload is `OnboardingGateSnapshot` |

The preload bridge keeps the function name `onStateChange` but its handler subscribes to the new channel name. Existing tests that referenced `permissions:state-changed` update one string.

## Testing

### Main process

- `onboarding-gate/__tests__/service.test.ts` — covers all four cells of the decision table with injected store reader
- `onboarding-gate/__tests__/watcher.test.ts` — full set of 10 cases inherited from current `PermissionWatcher`, just renamed
- `__tests__/onboarding-gate.test.ts` — 5 existing main-flow tests (window creation, advance, refresh, IPC handlers) + 1 new test verifying `store.onDidChange('onboarding')` triggers `refreshOnboardingGateAndMaybeAdvance`

### Preload

- `preload/__tests__/index.test.ts` — change one channel string in the existing `onStateChange` test

### Renderer

- `pages/onboarding/__tests__/shell.test.tsx`
  - stepper renders three dots with current highlighted
  - completed steps render checkmark; clicking jumps back
  - incomplete steps' stepper dots are guarded
  - Continue button respects current step's `useStepReady()`
  - `?variant=recovery` renders standalone (no stepper, no nav)
- `steps/__tests__/permissions-step.test.tsx` — migrate the 12 existing onboarding test cases; add 1 case for recovery variant
- `steps/__tests__/providers-step.test.tsx`
  - Only featured cards visible by default
  - Expanding "+ 全部" reveals full list
  - Clicking Connect opens `ProviderConnectDialog` (mocked)
  - On successful connection, if no active provider for that domain, auto-set active
  - Gate respects `activeProviders.{llm,asr}`
- `steps/__tests__/shortcuts-step.test.tsx`
  - Initial sub-step `'quick'`
  - Two `Meta` keydowns within 300ms → `'detected'` → demo mounted
  - Two `Meta` keydowns >300ms apart do NOT trigger
  - `e.repeat: true` keydown ignored
  - After demo emits `onComplete`, sub-step → `'done'`, shell switches to `'hold'`
  - Hold detection: keydown `Meta` + keydown ` `, hold ≥500ms (use fake timers), keyup → detected
  - Hold <500ms does not trigger
  - `active=false` mounts no listeners
- `steps/__tests__/shortcuts-demo.test.tsx`
  - Stage timing with fake timers
  - `onComplete` fires after final stage
  - Unmount mid-flight cancels remaining timeouts (no callbacks fire post-unmount)

### Manual smoke checklist (no E2E framework)

- Fresh install (clear `userData`): full three-step flow completes; main window opens at the end
- Re-launch after completion: main window opens directly, no onboarding
- Re-launch after revoking microphone permission: onboarding window opens in `permission-recovery` mode (no stepper); regranting closes it and opens main without re-running providers/shortcuts
- Re-launch after disconnecting all providers: main window opens directly (we do not re-gate)

### Out of scope for tests

- Visual snapshots of CSS keyframes
- `ProviderConnectDialog` internals (covered by existing `pages/main/providers.test.tsx`)
- i18n (no framework yet)

## Migration / rename plan

This change ripples through several names. The implementation plan should sequence them so each commit is green:

1. Add `onboarding-gate/` as a new directory copying `permission-gate/` content + extending types/service. **Don't delete the old directory yet.**
2. Add the new `OnboardingShell` + steps under existing `pages/onboarding/`. Keep `permissions.tsx` as a thin re-export of `permissions-step.tsx` until callers migrate.
3. Switch `main/index.ts`, `windowManager`, IPC channel name, and tests over to the new names.
4. Delete the legacy files and the old `permissions.tsx` re-export.

This avoids a single megacommit that breaks every test at once.

## Non-Goals (YAGNI)

- Per-step `completedAt` tracking (single overall flag is enough)
- Re-entering onboarding from settings menu (out of scope for first-run)
- "Skip" buttons on steps 2/3 (gate enforces completion)
- Inline Sherpa-ONNX download progress in the onboarding card (existing settings dialog handles it)
- Generic step-machine abstraction (three steps + sub-steps doesn't justify it)
- Telemetry on completion times
