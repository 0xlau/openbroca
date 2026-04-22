# Desktop Shortcuts Design

**Date:** 2026-04-22

## Goal

Add a new desktop `Shortcuts` page under the existing `Settings` sidebar group so users can configure three capture shortcuts:

- `Quick`: hold to listen, release to stop capture and start the existing ASR + LLM pipeline
- `To Hold`: while `Quick` is still held, press one extra key to latch capture into a sustained listening mode
- `Hold`: press once to start sustained listening immediately, press again to stop

The product goal is:

- expose the three capture modes in a way that matches the user's mental model
- make `To Hold` explicit as a transition gesture rather than a standalone global shortcut
- let sustained listening be stopped either from the keyboard or from the floating listening window
- keep the new settings page visually consistent with the existing desktop settings pages

The engineering goal is:

- extend the current single-shortcut implementation without mixing input parsing and session semantics
- keep main-process ownership of capture lifecycle so keyboard and floating-window actions share one stop path
- validate obvious shortcut conflicts before persistence
- add regression coverage around the new shortcut state transitions

## Scope

This design covers:

- a new `/shortcuts` route and page in the desktop renderer
- adding `Shortcuts` to the `Settings` navigation group
- expanding shortcut persistence from one accelerator to three shortcut settings
- renderer-side validation for shortcut conflicts
- main-process shortcut handling for `quick`, `toHold`, and `hold`
- a new floating listening confirm action for sustained listening states
- tests for page behavior, shortcut validation, and main-process state transitions

This design does not cover:

- per-app shortcut overrides
- recording shortcuts outside the desktop capture flow
- arbitrary multi-step shortcut macros
- custom behavior for the existing `processing` cancel button
- changing the ASR/LLM pipeline itself

## Current Context

The existing settings navigation in [nav-settings.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/components/nav-settings.tsx) currently exposes `Providers` and `Prompts`, but no shortcuts page.

Renderer persistence already has a `shortcuts` store in [shortcuts-store.ts](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/stores/shortcuts-store.ts), but it only stores one field: `floatingWindowAccelerator`.

Main-process capture currently binds that single accelerator in [floating-session-controller.ts](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/main/floating-session-controller.ts) as a simple press-to-start and release-to-stop flow.

Keyboard parsing lives in [shortcut-manager.ts](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/main/shortcut-manager.ts). Today it is optimized for one accelerator with `onDown` and `onUp` callbacks. That is too narrow for the new `toHold` transition, but the file is still the correct low-level boundary for keyboard event normalization.

The floating listening shell in [float-listening.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/pages/float/float-listening.tsx) currently shows only the waveform shell and, during `processing`, a right-side cancel button. There is no manual "finish capture" affordance for sustained listening.

## Approaches Considered

### Recommended: keep keyboard parsing low-level and add a small capture-mode state machine above it

This extends `shortcut-manager` so it can report multiple shortcut events, but keeps all session semantics in `floating-session-controller`.

Why this is preferred:

- input parsing stays reusable and testable
- capture ownership remains in the main process
- `quick`, `toHold`, `hold`, keyboard stop, and floating-window stop all converge on one lifecycle
- tests can focus on business transitions instead of low-level key event details

### Alternative: move mode semantics directly into `shortcut-manager`

This would reduce some controller wiring, but it would turn the input layer into a keyboard-plus-capture business object. That would blur responsibilities and make future shortcut work harder to reason about.

### Alternative: keep `quick` in main and let renderer drive `toHold`

This was rejected because `toHold` is defined as a transition inside an active capture session. Splitting that between main and renderer would create two sources of truth for capture ownership.

## Decision Summary

Use the recommended approach.

The implementation will:

- add a `Shortcuts` settings page at `/shortcuts`
- extend shortcut persistence to three settings: `quickAccelerator`, `toHoldKey`, `holdAccelerator`
- model `toHold` as a single key, not a full accelerator
- validate conflicts in the renderer before save
- extend main-process shortcut listening to support:
  - `quick` press-and-release capture
  - `toHold` latching while `quick` remains pressed
  - `hold` press-to-toggle sustained capture
- add a left-side confirm button to the floating listening shell for sustained listening states
- keep the existing right-side cancel button scoped to `processing`

## User Experience

### Navigation

Add `Shortcuts` to the `Settings` group in [nav-settings.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/components/nav-settings.tsx).

Recommended order:

1. `Providers`
2. `Prompts`
3. `Shortcuts`

### Route

Add a new main-page route:

- `/shortcuts`

The page should live alongside the existing settings routes in [router/index.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/router/index.tsx).

### Page Layout

The new page should use the same overall layout language as existing settings pages such as [providers.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/pages/main/providers.tsx) and [prompts.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/pages/main/prompts.tsx):

- centered container with `max-w-5xl`
- page title and helper copy at the top
- action area on the right when there are unsaved edits
- stacked content sections below

The page contains three shortcut sections:

#### Quick

Shows the current global accelerator used for hold-to-talk capture.

Helper copy should explain:

- press and hold to start listening
- release to stop capture and immediately continue into ASR + LLM

Default value:

- `Option+Space`

#### To Hold

Shows a single-key input, not a full accelerator input.

Helper copy should explain:

- this only works while `Quick` is currently held
- press it once during `Quick` capture to keep listening after all keys are released
- once latched, listening continues until the user presses `Quick` again or uses the floating confirm button

Recommended default:

- `Tab`

#### Hold

Shows the global accelerator used for immediate sustained listening.

Helper copy should explain:

- press once to start sustained listening
- press the same shortcut again to stop
- the floating confirm button can also stop this mode

Recommended default:

- `Option+Shift+Space`

### Save Behavior

The page should follow the same dirty-state pattern used elsewhere in settings pages:

- `Save changes` appears only when the page has unsaved edits
- validation errors block save
- a successful save clears dirty state
- page-local validation messages should disappear once the conflicting values are corrected

Include a secondary action:

- `Reset to defaults`

This action restores the three default values in the editor, but still requires an explicit save.

## Data Model

Replace the current single-field shortcuts shape with:

```ts
type ShortcutSettings = {
  quickAccelerator: string
  toHoldKey: string
  holdAccelerator: string
}
```

Default values:

```ts
const defaultShortcutSettings: ShortcutSettings = {
  quickAccelerator: 'Option+Space',
  toHoldKey: 'Tab',
  holdAccelerator: 'Option+Shift+Space'
}
```

### Why `toHoldKey` is a single key

`To Hold` is not an independent global shortcut. It is only meaningful while `Quick` is actively held. Modeling it as a single key:

- matches the product rule directly
- makes validation clearer
- avoids implying it can be triggered from idle state
- reduces ambiguity around modifier matching

If the input UI supports displaying a normalized key label, it should do so, but persistence should remain the simplest string representation of one key.

## Validation Rules

Validation happens in the renderer before persistence.

Required rules:

- `quickAccelerator` and `holdAccelerator` must not be identical
- `toHoldKey` must not equal the primary trigger key used by `quickAccelerator`
- `toHoldKey` must not equal the primary trigger key used by `holdAccelerator`
- all three inputs must be non-empty after normalization

Normalization should be explicit and conservative:

- accelerator strings should be normalized to the app's existing accelerator format before comparison
- `toHoldKey` should be normalized to one canonical key label
- invalid or unsupported key input should show a local error instead of silently coercing to another key

The page should show inline validation feedback near the relevant field or as a compact page-level error summary. The important requirement is that the error explains exactly which conflict exists.

## Main-Process Architecture

### Responsibility Split

Keep `shortcut-manager` as the low-level keyboard adapter and let `floating-session-controller` own capture semantics.

Recommended responsibilities:

`shortcut-manager`

- parse and normalize accelerators
- track current keydown and keyup events
- notify subscribers when configured shortcuts or configured single keys fire

`floating-session-controller`

- decide whether a key event should start, latch, ignore, or stop capture
- map capture state to floating-window visibility
- expose one stop path for keyboard and floating-window actions

### Capture Modes

Introduce an explicit capture mode concept inside the floating session controller:

```ts
type CaptureMode = 'quick' | 'latched' | 'hold' | null
```

This is separate from the existing session bridge status. The bridge status still represents runtime session state such as `idle`, `starting`, `listening`, or `processing`. `CaptureMode` explains why capture is currently active and what should happen next when more key events arrive.

### Event Rules

#### Idle

- `quick down`: start capture and set `CaptureMode = 'quick'`
- `hold down`: start capture and set `CaptureMode = 'hold'`
- `toHold down`: ignore

#### Quick Capture

- `toHold down` while `quick` is still pressed: switch `CaptureMode` from `quick` to `latched`
- `quick up` while mode is still `quick`: stop capture and continue into the existing ASR + LLM flow
- `hold down` while `quick` capture is active: ignore

#### Latched Capture

- releasing `quick`: no effect
- `quick down`: stop capture and clear mode
- floating confirm button: stop capture and clear mode
- `hold down`: ignore

#### Hold Capture

- `hold down`: stop capture and clear mode
- floating confirm button: stop capture and clear mode
- `quick` and `toHold`: ignore

#### Processing

- the new confirm button is hidden
- the existing cancel button behavior remains unchanged

### Error Recovery

If the current session bridge state is `error`, the controller should preserve the existing recovery pattern of resetting or stopping the session before attempting a new start.

If a keyboard event arrives while capture is already active in a conflicting mode, the controller should ignore it instead of trying to merge modes.

If a stop is triggered from keyboard or UI while capture is no longer active, the action should be a safe no-op.

## Floating Listening Window

Update [float-listening.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/renderer/src/pages/float/float-listening.tsx) to support a left-side confirm button for sustained listening modes.

### Button Rules

Show the left-side confirm button only when capture is active in:

- `latched`
- `hold`

Do not show it during:

- `idle`
- `starting`
- `quick` capture before latching
- `processing`
- `error`

The existing right-side cancel button should remain visible only for `processing`, exactly as it works now.

### Action Path

The confirm button should call a dedicated IPC action such as:

- `window.api.listeningSession.finishCapture()`

This action should route to the same main-process stop path used by keyboard-driven stop behavior for sustained listening. The renderer should not attempt to infer whether it is stopping `latched` or `hold`; it should delegate that to the controller.

## IPC And Store Changes

Renderer persistence keeps using the existing `shortcuts` store key, but with the new shape.

The main process should react to store changes the same way it does today: when shortcut settings change, rebind the keyboard listeners using the latest values.

Add one renderer-to-main listening-session API for the floating confirm action if no suitable stop API already exists.

Expose the active capture mode from the main process through the listening-session bridge so the floating window can decide when to show the confirm button. The simplest acceptable contract is either:

- `captureMode: 'quick' | 'latched' | 'hold' | null`

or

- a derived boolean that explicitly means "manual finish is available"

The preferred option is `captureMode`, because it keeps renderer display rules explicit and gives tests a stable contract.

No renderer polling or ad-hoc local mode tracking should be introduced for this feature. The renderer should consume bridge state derived from the main process.

## Testing

### Main-Process Tests

Extend or add tests around [floating-session-controller.ts](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-desktop-shortcuts/apps/desktop/src/main/floating-session-controller.ts) to cover:

- `quick down` starts capture
- `quick up` from `quick` mode stops capture
- `quick down` then `toHold down` then `quick up` stays active
- `quick down` while `latched` stops capture
- `hold down` from `idle` starts capture
- `hold down` while in `hold` mode stops capture
- floating confirm action stops `latched`
- floating confirm action stops `hold`
- irrelevant keys are ignored in each active mode

### Shortcut Parsing And Validation Tests

Add focused coverage for:

- accelerator normalization used by conflict checks
- parsing the primary trigger key from `quickAccelerator` and `holdAccelerator`
- rejecting empty or unsupported `toHoldKey`
- rejecting `quick`/`hold` identity conflicts
- rejecting `toHold` collisions with `quick` or `hold` primary keys

### Renderer Tests

Add page tests for:

- `Shortcuts` navigation entry appears in settings
- `/shortcuts` renders the three sections with helper copy
- default values render from persisted state
- save is hidden when clean and shown when dirty
- validation errors block save
- reset-to-defaults restores editor values without auto-saving

Extend floating window tests for:

- confirm button hidden during `quick` capture
- confirm button visible during sustained listening
- confirm button absent during `processing`
- cancel button remains right-aligned and scoped to `processing`

## Rollout Notes

Because the persisted `shortcuts` shape changes, the renderer store normalizer should treat missing fields as defaults. This keeps existing users from losing shortcut functionality after upgrading.

No migration UI is required. The first launch after the update should silently backfill defaults for any missing new fields.
