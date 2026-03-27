# Listening Session State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a main-owned listening session state machine with renderer subscription support so the floating listening UI activates `LiveWaveform` only when the session is truly in `listening`.

**Architecture:** Keep `ListeningSessionManager` as the single source of truth in the main process, with a small serializable `ListeningSessionState` model shared across main, preload, and renderer. Expose that state through a preload bridge with snapshot and subscription APIs, then consume it in a thin renderer store so `FloatListening` stays presentation-focused and never infers state from window visibility.

**Tech Stack:** TypeScript, Electron, electron-vite, React, Zustand, Vitest, Testing Library, jsdom

---

## File Map

### Create

- `apps/desktop/vitest.config.ts` — desktop-specific Vitest config for main, preload, and renderer tests
- `apps/desktop/src/shared/listening-session-state.ts` — shared `ListeningSessionState` type and helpers safe for both node and web builds
- `apps/desktop/src/main/__tests__/listening-session.test.ts` — unit tests for the session state machine
- `apps/desktop/src/preload/__tests__/index.test.ts` — tests for preload listening session bridge behavior
- `apps/desktop/src/renderer/src/stores/listening-session-store.ts` — thin renderer-facing store or subscription wrapper for session state
- `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx` — renderer tests covering waveform activation by session state

### Modify

- `apps/desktop/package.json` — add desktop test dependencies and a local `test` script
- `apps/desktop/tsconfig.node.json` — include shared files and optional Vitest node types if needed
- `apps/desktop/tsconfig.web.json` — include shared files and renderer test files
- `apps/desktop/src/main/listening-session.ts` — implement state machine, subscriptions, and error normalization
- `apps/desktop/src/main/index.ts` — register IPC handlers/events for listening session state
- `apps/desktop/src/preload/index.ts` — expose `window.api.listeningSession`
- `apps/desktop/src/preload/index.d.ts` — type the new preload API
- `apps/desktop/src/renderer/src/pages/float/float-listening.tsx` — bind `LiveWaveform.active` to session state

### Keep Behavior Stable

- The global shortcut still controls showing and hiding the floating window
- Audio capture still starts from the existing shortcut entry point
- `windowManager` remains responsible only for window visibility, not listening truth
- `LiveWaveform` becomes active only in `status === 'listening'`

## Task 1: Establish desktop test infrastructure before touching session logic

**Files:**
- Create: `apps/desktop/vitest.config.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/tsconfig.node.json`
- Modify: `apps/desktop/tsconfig.web.json`

- [ ] **Step 1: Add a desktop-local test command and test-only dependencies**

Update `apps/desktop/package.json` to add a local test script and the minimum renderer test dependencies:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "jsdom": "^26.1.0"
  }
}
```

Keep `vitest` at the workspace root unless install resolution forces adding it locally.

- [ ] **Step 2: Create the desktop Vitest config**

Add `apps/desktop/vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    environmentMatchGlobs: [
      ['src/renderer/**/*.test.tsx', 'jsdom'],
      ['src/renderer/**/*.test.ts', 'jsdom'],
    ],
    environment: 'node',
    globals: true,
  },
  plugins: [react()],
})
```

This keeps main and preload tests in `node`, while renderer component tests run in `jsdom`.

- [ ] **Step 3: Update TypeScript includes so shared and test files compile cleanly**

Adjust:

- `apps/desktop/tsconfig.node.json` to include `src/shared/**/*`
- `apps/desktop/tsconfig.web.json` to include `src/shared/**/*` and renderer test files

If the test compiler complains about Vitest globals, add `"types": ["vitest/globals"]` in the Vitest config via `test.globals: true` first, and only add tsconfig type entries if needed.

- [ ] **Step 4: Run the desktop test command before adding tests**

Run: `pnpm --dir apps/desktop test`
Expected: PASS with `0 test` or a clean "no tests found" result, confirming the desktop test harness boots.

- [ ] **Step 5: Commit the desktop test harness**

```bash
git add apps/desktop/package.json apps/desktop/tsconfig.node.json apps/desktop/tsconfig.web.json apps/desktop/vitest.config.ts
git commit -m "test: add desktop vitest harness"
```

## Task 2: Define the shared listening session state contract

**Files:**
- Create: `apps/desktop/src/shared/listening-session-state.ts`
- Modify: `apps/desktop/src/main/listening-session.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`

- [ ] **Step 1: Write the failing main test around the new state contract**

Create `apps/desktop/src/main/__tests__/listening-session.test.ts` with a first test that imports `ListeningSessionState` from `../../shared/listening-session-state.ts` and expects a fresh manager to report `idle`.

Starter test shape:

```ts
import { describe, expect, test } from 'vitest'
import { ListeningSessionManager } from '../listening-session'

describe('ListeningSessionManager', () => {
  test('starts in idle state', () => {
    const manager = new ListeningSessionManager(/* mock capture source */)
    expect(manager.getState()).toEqual({ status: 'idle' })
  })
})
```

- [ ] **Step 2: Run the new main test and verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts`
Expected: FAIL because `getState()` and/or the shared state module do not exist yet.

- [ ] **Step 3: Create the shared state file**

Add `apps/desktop/src/shared/listening-session-state.ts`:

```ts
export type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'error'; message: string }

export function isListeningSessionActive(state: ListeningSessionState): boolean {
  return state.status === 'listening'
}
```

Use this same type in main, preload types, and renderer state.

- [ ] **Step 4: Export the new manager state API minimally**

Update `apps/desktop/src/main/listening-session.ts` to expose:

```ts
getState(): ListeningSessionState
subscribe(listener: (state: ListeningSessionState) => void): () => void
```

Do not implement full transitions yet; return the initial `idle` state and a basic listener set so the contract exists.

- [ ] **Step 5: Re-run the initial state test and make it pass**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts`
Expected: PASS for the initial-state test.

- [ ] **Step 6: Commit the shared state contract**

```bash
git add apps/desktop/src/shared/listening-session-state.ts apps/desktop/src/main/listening-session.ts apps/desktop/src/main/__tests__/listening-session.test.ts apps/desktop/src/preload/index.d.ts
git commit -m "feat: add listening session state contract"
```

## Task 3: Implement the `ListeningSessionManager` state machine with TDD

**Files:**
- Modify: `apps/desktop/src/main/listening-session.ts`
- Modify: `apps/desktop/src/main/__tests__/listening-session.test.ts`

- [ ] **Step 1: Expand the failing test suite to cover the approved lifecycle**

Add tests for:

- `start()` transitions `idle -> starting`
- successful capture transitions to `listening`
- `stop()` transitions `listening -> stopping -> idle`
- repeated `start()` while active is ignored
- repeated `stop()` while idle is a no-op
- thrown setup/runtime error transitions to `error`
- abort-driven shutdown does not transition to `error`

Use a controllable fake capture source that can:

- resolve format
- return an async iterable stream
- delay chunks until the test advances it
- throw on demand

- [ ] **Step 2: Run the focused main test suite and verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts`
Expected: FAIL on missing transitions and subscription notifications.

- [ ] **Step 3: Implement the internal state machine**

In `apps/desktop/src/main/listening-session.ts`:

- add a private `state: ListeningSessionState = { status: 'idle' }`
- add a private listener `Set`
- add a private `setState(next: ListeningSessionState)` helper that stores and broadcasts
- move `start()` to:
  - ignore when already `starting` or `listening`
  - set `starting` before launching async work
- move `stop()` to:
  - ignore when already `idle`
  - set `stopping`
  - abort the current controller
- ensure the async `run()` path:
  - sets `listening` once the capture loop is actually entered
  - writes the WAV file on normal completion
  - returns to `idle` on expected stop completion
  - maps unexpected failures to `{ status: 'error', message }`

- [ ] **Step 4: Normalize abort handling**

Treat `AbortError` or the capture source's expected cancellation signal as a normal stop path:

```ts
if (isAbortLikeError(error, opts.signal)) {
  this.setState({ status: 'idle' })
  return
}
```

Add a small local helper if needed instead of sprinkling error-shape checks inline.

- [ ] **Step 5: Re-run the main session tests and make them pass**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the state machine implementation**

```bash
git add apps/desktop/src/main/listening-session.ts apps/desktop/src/main/__tests__/listening-session.test.ts
git commit -m "feat: add listening session state machine"
```

## Task 4: Bridge listening session state from main to renderer

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Create: `apps/desktop/src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing preload bridge tests first**

Create `apps/desktop/src/preload/__tests__/index.test.ts` with mocks for `electron` that verify:

- `window.api.listeningSession.getState()` invokes the correct IPC channel
- `window.api.listeningSession.onStateChange()` subscribes to the event channel
- the unsubscribe function removes the listener

Suggested expectations:

```ts
expect(ipcRenderer.invoke).toHaveBeenCalledWith('listening-session:get-state')
expect(ipcRenderer.on).toHaveBeenCalledWith('listening-session:state-changed', expect.any(Function))
expect(ipcRenderer.removeListener).toHaveBeenCalledWith('listening-session:state-changed', expect.any(Function))
```

- [ ] **Step 2: Run the preload bridge tests and verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/preload/__tests__/index.test.ts`
Expected: FAIL because the listening session API is not exposed yet.

- [ ] **Step 3: Add IPC channels in the main process**

In `apps/desktop/src/main/index.ts`:

- register `ipcMain.handle('listening-session:get-state', ...)`
- subscribe once to `listeningSession.subscribe(...)`
- on each state change, broadcast to all windows with:

```ts
for (const window of BrowserWindow.getAllWindows()) {
  window.webContents.send('listening-session:state-changed', state)
}
```

Keep the broadcaster near other app lifecycle wiring, not inside `ListeningSessionManager`.

- [ ] **Step 4: Expose the preload bridge**

Update `apps/desktop/src/preload/index.ts` and `apps/desktop/src/preload/index.d.ts` so `window.api` contains:

```ts
listeningSession: {
  getState: () => ipcRenderer.invoke('listening-session:get-state'),
  onStateChange: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('listening-session:state-changed', handler)
    return () => ipcRenderer.removeListener('listening-session:state-changed', handler)
  },
}
```

Use the shared `ListeningSessionState` type in the `.d.ts` file.

- [ ] **Step 5: Re-run the preload bridge tests and make them pass**

Run: `pnpm --dir apps/desktop exec vitest run src/preload/__tests__/index.test.ts`
Expected: PASS

- [ ] **Step 6: Run the main session tests as a regression check**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts src/preload/__tests__/index.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the bridge layer**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.d.ts apps/desktop/src/preload/__tests__/index.test.ts
git commit -m "feat: bridge listening session state to renderer"
```

## Task 5: Consume listening session state in renderer and wire `FloatListening`

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/listening-session-store.ts`
- Create: `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`

- [ ] **Step 1: Write the failing renderer tests first**

Create `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`.

Mock:

- `@openbroca/ui` to capture the `LiveWaveform` props
- `@renderer/stores/microphone-store` to return a stable device ID
- the listening session store module to return each state variant

Add assertions for:

- `listening` => `active === true`
- `idle`, `starting`, `stopping`, `error` => `active === false`

- [ ] **Step 2: Run the renderer test and verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: FAIL because the listening session store does not exist and the component still hardcodes `active={false}`.

- [ ] **Step 3: Create the thin renderer store**

Add `apps/desktop/src/renderer/src/stores/listening-session-store.ts` with:

- default state `{ status: 'idle' }`
- one `initializeListeningSessionState()` function that:
  - fetches `window.api.listeningSession.getState()`
  - subscribes to `window.api.listeningSession.onStateChange(...)`
  - updates the store
- one `useListeningSessionState()` selector or hook for UI consumers

Keep this layer reflective only. Do not add renderer-side transition logic.

- [ ] **Step 4: Update `FloatListening` to consume the session state**

In `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`:

- read session state from the new store or hook
- derive:

```ts
const active = state.status === 'listening'
```

- pass `active={active}` to `LiveWaveform`

Do not couple this component to floating-window visibility or shortcut state.

- [ ] **Step 5: Re-run the renderer tests and make them pass**

Run: `pnpm --dir apps/desktop exec vitest run src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full desktop test suite**

Run: `pnpm --dir apps/desktop test`
Expected: PASS for main, preload, and renderer tests.

- [ ] **Step 7: Run the desktop typecheck**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS

- [ ] **Step 8: Commit the renderer integration**

```bash
git add apps/desktop/src/renderer/src/stores/listening-session-store.ts apps/desktop/src/renderer/src/pages/float/float-listening.tsx apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx
git commit -m "feat: drive floating waveform from listening session state"
```

## Task 6: Final verification and cleanup

**Files:**
- Modify only if verification exposes gaps

- [ ] **Step 1: Run the complete verification set in order**

Run:

```bash
pnpm --dir apps/desktop exec vitest run src/main/__tests__/listening-session.test.ts src/preload/__tests__/index.test.ts src/renderer/src/pages/float/__tests__/float-listening.test.tsx
pnpm --dir apps/desktop test
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop lint
```

Expected: PASS on all commands.

- [ ] **Step 2: Smoke-check the desktop app manually**

Run: `pnpm --dir apps/desktop dev`
Expected manual checks:

- pressing the floating-window shortcut still shows the floating window
- while capture is stabilizing, waveform remains inactive
- once the session reaches `listening`, waveform becomes active
- releasing or stopping returns waveform to inactive
- no renderer errors appear in devtools or terminal during state transitions

- [ ] **Step 3: Commit any final verification fixes**

```bash
git add apps/desktop
git commit -m "test: finalize listening session state verification"
```
