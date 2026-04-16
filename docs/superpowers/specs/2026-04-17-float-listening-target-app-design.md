# Float Listening Target App Design

**Date:** 2026-04-17

## Goal

Add a left-side circular app icon to the desktop floating listening UI.

The icon should represent the app the user is actively typing into when that can be determined reliably. If the focused input owner cannot be resolved, the app should silently fall back to the current frontmost app. If neither can be resolved, the icon should not render.

The feature must be designed for both macOS and Windows.

## Scope

This design covers:

- target app resolution during the floating listening session
- cross-platform focused-input detection
- fallback behavior to frontmost app
- renderer state updates for the float window
- icon rendering behavior in `float-listening.tsx`
- tests for service behavior, bridge updates, and UI rendering

This design does not cover:

- permission onboarding or permission education UI
- changing instruction matching rules
- changing post-recording frontmost snapshot behavior
- Linux support

## Decision Summary

Use a new cross-platform `FocusedInputAppService` in the main process and make the floating UI consume a resolved `targetApp` value from the existing listening-session bridge.

The resolution order is:

1. app that owns the currently focused editable control
2. current frontmost app
3. `null`

The renderer should never perform platform detection or direct app discovery. It should only render the app icon when `targetApp.iconDataUrl` exists.

## User-Facing Behavior

When the floating listening UI is visible:

- if the OS reports a focused editable control, show that app's icon in a circular container on the left
- if focused editable detection fails, silently show the frontmost app's icon instead
- if the app identity is unavailable or the icon cannot be resolved, do not render the left icon container
- the waveform remains in the existing rounded container
- the close button behavior is unchanged

The app must not show a permission prompt or warning as part of this feature. Permission gaps are treated as normal detection failures and follow the fallback chain.

## Current Constraints

The codebase already has:

- a cross-platform app discovery client in `packages/app-identity`
- `AppIdentityService` in the main process that hydrates `iconDataUrl`
- a listening-session bridge that broadcasts session state to renderer windows
- a float listening page with no app data source today

The current discovery layer only knows how to resolve the frontmost app. It does not have a notion of focused editable ownership.

## Architecture

### New Main-Process Service

Add a `FocusedInputAppService` responsible for one method:

```ts
getFocusedInputApp(): Promise<AppIdentity | null>
```

This service should:

- attempt focused editable control detection through a platform-specific resolver
- convert the resolved process or bundle identity into the existing `AppIdentity` shape
- hydrate icons through the existing `AppIdentityService` path when possible
- silently fall back to `AppIdentityService.getFrontmostApp()`
- return `null` when both focused-input and frontmost resolution fail

### Listening Session Integration

The listening-session bridge should carry both session status and target app data.

Recommended renderer-facing shape:

```ts
type ListeningSessionBridgeState = {
  state: ListeningSessionState
  targetApp: AppIdentity | null
}
```

The main process owns polling and change detection. The renderer store remains passive.

### Renderer Integration

`FloatListening` should read the bridge state and render:

- left circular icon only when `targetApp?.iconDataUrl` exists
- existing waveform capsule in the middle
- existing optional close button on the right

The app icon container should disappear entirely when no icon is available. Do not show a placeholder circle.

## Data Flow

### Session Start And Updates

When the listening session enters `starting`, `listening`, or `stopping`:

1. start or keep a polling loop for target app resolution
2. resolve target app through `FocusedInputAppService`
3. compare with the last broadcast app identity
4. broadcast only when the app identity meaningfully changes

When the listening session enters `idle` or `error`:

- stop polling
- clear `targetApp` to `null`
- broadcast the cleared bridge state once if needed

### Equality Rules

Use stable app identity comparison to avoid noisy UI updates.

Preferred comparison order:

1. `id`
2. `bundleId`
3. `aumid`
4. `path`

If all comparable identifiers are absent, treat the value as changed.

## Platform Strategy

### macOS

Use the system accessibility API to inspect the currently focused UI element.

The resolver should:

- attempt to read the focused application and focused UI element
- determine whether the focused element is editable text input
- accept common editable cases such as text fields, text areas, and editable web content
- reject focused elements that are not editable inputs

If the element is editable, resolve the owning application and map it to `AppIdentity`.

If the accessibility query fails, permissions are missing, or the focused element is not editable, fall back to frontmost app detection.

### Windows

Use UI Automation to inspect the currently focused element.

The resolver should:

- call the focused-element API
- inspect control metadata such as control type and editability patterns
- accept common editable cases such as edit controls, combo-box editable fields, and document-like editable surfaces
- reject focused elements that are not text-entry contexts

If the element is editable, resolve its owning process and map it to `AppIdentity`.

If UI Automation fails, access is restricted, or the focused element is not editable, fall back to frontmost app detection.

## Polling Strategy

Polling is acceptable here because the float UI is short-lived and the resolved value is lightweight compared with audio capture and post-processing.

Use these rules:

- polling interval: `500ms`
- active only while session status is `starting`, `listening`, or `stopping`
- no polling in `idle` or `error`
- skip renderer broadcasts when the resolved target app has not changed

This gives timely updates when the user changes apps or moves focus while keeping main-process work bounded.

## Failure Handling

All failures in this feature are soft failures.

Required behavior:

- focused-input detection errors must not surface to the UI
- frontmost fallback errors must not surface to the UI
- polling failures must not break the listening session
- unresolved target app must produce `null`, not an exception

Debug logging is allowed in the main process, but logs should remain concise and avoid repeated noise on every polling tick.

## File-Level Changes

The implementation is expected to touch these areas:

- `apps/desktop/src/main`
  - add focused-input service and platform adapters
  - update listening-session bridge payloads and polling lifecycle
- `packages/app-identity`
  - extend platform support helpers only if shared identity normalization is useful
- `apps/desktop/src/renderer/src/stores`
  - store bridge state with `targetApp`
- `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
  - render the left circular icon when available
- tests in main and renderer

The preferred direction is to keep platform-specific native detection in the main process, not in shared renderer code.

## Alternatives Considered

### Frontmost App Only

This would be easy because the codebase already supports frontmost detection and icon hydration.

It is rejected because it does not satisfy the core product requirement when a user is actively typing in an editable surface.

### Renderer-Driven Polling Through TRPC

This would let the float window query app identity directly.

It is rejected because it duplicates polling logic in the renderer, complicates timing, and makes the float page responsible for platform-aware state assembly.

### Single Snapshot At Session Start

This would reduce implementation complexity by resolving target app once.

It is rejected because users can change applications or move focus during a listening session, which would make the icon stale.

## Testing

### Main Process

Add tests for `FocusedInputAppService` that cover:

- returns focused input app when editable focus resolution succeeds
- falls back to frontmost app when focused input resolution returns `null`
- falls back to frontmost app when focused input resolution throws
- returns `null` when both focused input and frontmost app fail

Add listening-session bridge tests that cover:

- starts polling when session becomes active
- stops polling and clears `targetApp` when session becomes inactive
- only broadcasts when target app identity changes

### Renderer

Update float listening tests to cover:

- renders the left icon when `targetApp.iconDataUrl` exists
- does not render the left icon container when `targetApp` is `null`
- does not render the left icon container when `targetApp` has no icon
- keeps waveform activation behavior unchanged

## Open Implementation Notes

The platform adapters may require a small native helper, shell bridge, or library addition depending on what the current Electron and Node environment already exposes cleanly. That decision belongs in the implementation plan, not in the renderer design.

Regardless of the underlying platform mechanism, the public behavior and fallback contract defined in this document should remain unchanged.
