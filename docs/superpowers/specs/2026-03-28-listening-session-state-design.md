# Listening Session State Design

**Date:** 2026-03-28

## Goal

Introduce an explicit, observable listening session state model in the desktop app so renderer UI can react to the real lifecycle of `ListeningSessionManager` instead of inferring state from floating window visibility.

The immediate user-facing goal is to make `LiveWaveform` in the floating listening window active only when the listening session is actually in the stable `listening` state. The engineering goal is to establish a single source of truth for session lifecycle that can support future UI, diagnostics, and workflow features.

## Current State

The current implementation has three disconnected pieces:

- `WindowManager` shows and hides the floating window
- `ListeningSessionManager` starts and stops audio capture
- `FloatListening` renders `LiveWaveform` with `active={false}`

This means the renderer has no way to observe the real listening lifecycle. It cannot distinguish between:

- the floating window being visible but capture not yet started
- capture actively running
- capture shutting down
- capture failing

As a result, the UI is not connected to the actual session state and any future listening-related UI would need to duplicate assumptions in multiple places.

## Decision Summary

The desktop app will promote listening lifecycle into a first-class stateful service owned by the main process.

The design introduces:

- an explicit `ListeningSessionState` model with transitional states
- state transitions owned only by `ListeningSessionManager`
- a main-to-renderer bridge that supports initial state reads and live subscriptions
- a thin renderer store or hook that exposes session state to pages and components

`FloatListening` will treat the listening session state as the source of truth and set `LiveWaveform.active` to `true` only when the current state is `listening`.

Floating window visibility remains a window-management concern and must not be reused as the listening truth source.

## State Model

The listening session will expose a discriminated union:

```ts
type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'error'; message: string }
```

This model is intentionally small but extensible. It captures the states that matter to UI and control flow without prematurely encoding low-level capture details.

### State Semantics

- `idle`: no active capture session exists
- `starting`: a start request has been accepted and setup is in progress
- `listening`: capture has entered the steady running phase
- `stopping`: a stop request has been accepted and shutdown or flush work is in progress
- `error`: session startup or runtime failed and the failure has been normalized for consumers

### Valid Transitions

- `idle -> starting -> listening`
- `starting -> error`
- `listening -> stopping -> idle`
- `stopping -> error`
- `error -> idle`
- `error -> starting`

Repeated commands must be idempotent:

- calling `start()` while already `starting` or `listening` must not create a second session
- calling `stop()` while already `idle` must be a safe no-op

## Architecture

### 1. Main Process Session Service

`ListeningSessionManager` becomes the single source of truth for listening lifecycle.

It will be responsible for:

- accepting `start` and `stop` commands
- maintaining current `ListeningSessionState`
- emitting state-change notifications
- converting runtime failures into stable `error` state payloads
- distinguishing expected abort-driven shutdown from real errors

This service should expose a small API surface:

- `getState(): ListeningSessionState`
- `start(options?): void`
- `stop(): void`
- `subscribe(listener): () => void`

The notification mechanism can be implemented with a simple internal listener set. The design does not require a third-party event library.

### 2. Main Process Bridge

The preload and IPC layer will expose the listening session state to renderer code.

The bridge must provide:

- a one-time read for the current state
- a subscription channel for subsequent updates

Recommended shape:

```ts
window.api.listeningSession.getState(): Promise<ListeningSessionState>
window.api.listeningSession.onStateChange(
  callback: (state: ListeningSessionState) => void
): () => void
```

This keeps renderer consumers simple and aligns with the existing preload ownership model. The bridge should only transport normalized session state and must not expose direct control over internal session objects.

### 3. Renderer Consumption Layer

Renderer code will use a thin store or hook to hide IPC details from pages.

Responsibilities:

- fetch the initial snapshot on mount or initialization
- subscribe to future updates
- provide the latest `ListeningSessionState` to UI consumers

The renderer layer should be intentionally small. It is not a second state machine and must not reinterpret transitions. It only reflects the state owned by main.

## UI Behavior

`FloatListening` will consume the renderer session state and derive waveform activation with a narrow rule:

- `active = state.status === 'listening'`

All other states map to inactive waveform rendering:

- `idle`
- `starting`
- `stopping`
- `error`

This choice avoids implying that audio capture is already live while startup is still in progress. It also preserves room for future UI improvements such as:

- a spinner or subtle loading treatment in `starting`
- a fade or temporary disabled state in `stopping`
- an error indicator or retry affordance in `error`

Those enhancements are out of scope for this change, but this state model is designed to support them cleanly.

## Error Handling

The session service must normalize failures into stable state transitions.

Required behavior:

- setup failures move the session to `error`
- runtime capture failures move the session to `error`
- intentional abort during stop must not be treated as an error
- after `error`, the service must remain recoverable and support a later `start()`

The `message` field should be safe for UI display and logging. Raw error objects must not cross the renderer boundary.

## Testing Strategy

### Unit Tests for `ListeningSessionManager`

Add or update tests to verify:

- initial state is `idle`
- `start()` transitions to `starting`
- successful startup transitions to `listening`
- `stop()` transitions to `stopping` and then `idle`
- expected abort does not produce `error`
- capture failures produce `error`
- repeated `start()` does not create duplicate sessions
- repeated `stop()` is safe

### Bridge Tests

Add tests for preload or IPC bridge behavior to verify:

- renderer can fetch the current state snapshot
- subscribers receive future state transitions
- unsubscribed listeners stop receiving updates

### Renderer Tests

Add or update tests for `FloatListening` to verify:

- `LiveWaveform.active` is `true` only in `listening`
- `LiveWaveform.active` is `false` in `idle`, `starting`, `stopping`, and `error`

## Scope Boundaries

This design includes:

- explicit listening session state
- main-owned lifecycle truth
- renderer subscription to that truth
- waveform activation based on real session state
- tests for lifecycle and UI mapping

This design does not include:

- new floating window behavior
- transcript generation or post-processing changes
- richer listening UI for transitional or error states
- migration of session events into tRPC subscriptions

## Future Evolution

This design intentionally leaves room for a later migration to a more unified domain API, including a possible tRPC subscription surface.

If the desktop app later expands listening-related UI, the same state source can support:

- session badges and status banners
- error toasts
- retry controls
- recording duration display
- transcription pipeline coordination

The key constraint for future work is to preserve `ListeningSessionManager` as the single source of truth and keep renderer state reflective rather than authoritative.
