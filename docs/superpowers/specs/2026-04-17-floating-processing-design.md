# Floating Processing State Design

**Date:** 2026-04-17

## Goal

Keep the desktop floating window open after shortcut release until the post-recording chain has fully settled, and make the floating UI explicitly show a processing state while ASR and LLM work is still running.

The immediate user-facing goals are:

- releasing the shortcut must no longer close the floating window while the current recording is still being saved, transcribed, or cleaned up by the LLM
- the floating UI must switch from listening waveform to a `Thinking...` state as soon as the user releases the shortcut
- all shortcut input must be ignored until the current post-recording chain has finished or has been cancelled
- once the chain settles, the floating window must hide automatically and the user must be able to start the next recording
- while in processing, the user must be able to click cancel to forcefully terminate the in-flight ASR or LLM work

## Scope

This design covers:

- listening-session lifecycle changes needed to represent post-recording processing as part of the same user-visible session
- floating window visibility rules during `keyup`, processing, success, failure, and cancel
- `FloatListening` UI updates for listening and processing states
- a reusable shimmering text component in `packages/ui/src`
- cancel semantics for post-recording work and the resulting history/debug behavior
- tests for state transitions, keyboard gating, processing cancel, and renderer output

This design does not cover:

- redesigning main-window history presentation
- introducing a new history status taxonomy such as `cancelled`
- adding retry UI inside the floating window
- changing instruction matching behavior
- changing provider selection or prompt construction behavior

## Current State

Today the relevant behavior is split across three layers:

- `shortcutManager` accepts key down and key up events
- `windowManager` shows or hides the floating window
- `ListeningSessionManager` controls audio capture and broadcasts `idle | starting | listening | stopping | error`

The current `keyup` path hides the floating window immediately:

1. shortcut key up calls `windowManager.hideFloating()`
2. hiding the floating window triggers `onFloatingHidden`
3. `onFloatingHidden` calls `listeningSession.stop()`
4. once capture ends, the completed recording is passed to `postRecordingPipeline.process(recording)`
5. the pipeline continues in the background after the user-visible session has already been torn down

This creates two UX problems:

- the floating window disappears before the user-visible action is actually finished
- there is no session state that represents "recording has ended, but ASR/LLM are still busy"

It also creates one control-flow problem:

- after `keyup`, the window and shortcut lifecycle are no longer tied to the in-flight pipeline, so repeated key presses can race with unfinished post-recording work

## Decision Summary

Make post-recording processing a first-class listening-session phase by introducing a new `processing` state and keeping the floating window open until the post-recording pipeline settles.

The design introduces:

- `processing` as an explicit renderer-visible listening-session state
- shortcut gating based on session state instead of direct `keyup -> hide window`
- a main-owned post-recording task handle that supports cancellation through `AbortController`
- a `Thinking...` floating UI rendered during processing
- a reusable shimmering text component exported from `packages/ui/src`
- processing cancel behavior that aborts in-flight work, hides the floating window immediately, returns the session to `idle`, and preserves a failed history record with explicit "cancelled by user" debug data

## User-Facing Behavior

### Normal Success Flow

1. user presses the shortcut
2. floating window appears in listening mode
3. user releases the shortcut
4. floating window stays visible and immediately switches to `Thinking...`
5. if the user presses or releases the shortcut again during processing, nothing happens
6. when the LLM result returns, the floating window hides automatically
7. the next shortcut press starts a fresh recording

### Failure Flow

The same UI flow applies when:

- ASR returns an empty transcript
- ASR fails
- LLM fails

In all of these cases:

- processing ends
- the floating window hides automatically
- shortcut input becomes available again
- history retains a failed record with debug information

### Processing Cancel Flow

While the floating window is showing `Thinking...`, a cancel button must be visible.

When the user clicks cancel:

- the current post-recording task is aborted
- the floating window hides immediately
- the session returns to `idle`
- shortcut input becomes available again
- history retains a failed record rather than dropping the attempt entirely

## State Model

The listening session becomes:

```ts
type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'processing' }
  | { status: 'error'; message: string }
```

`processing` means:

- audio capture has already ended
- the current recording has been accepted for post-recording work
- storage, ASR, and/or LLM work is still in progress
- the session is still considered active from a user-control perspective
- the floating window must remain visible
- shortcut input must be ignored

### State Semantics

- `idle`: no active capture or post-recording task exists
- `starting`: a recording start request has been accepted and capture setup is in progress
- `listening`: audio capture is actively running
- `stopping`: the stop request has been accepted and capture shutdown is still in progress
- `processing`: capture has ended and post-recording work is still active
- `error`: an unrecoverable listening-session lifecycle error occurred; this is not intended to be a long-lived floating-window state for this feature

### Valid Transitions

- `idle -> starting -> listening`
- `starting -> stopping`
- `listening -> stopping`
- `stopping -> processing`
- `processing -> idle`
- `starting | listening | stopping | processing -> error -> idle`

Cancel during processing behaves as:

- `processing -> idle`

This transition may internally record cancellation metadata, but renderer consumers only need to observe the resulting return to `idle`.

## Architecture

### 1. Main-Owned Session Lifecycle

`ListeningSessionManager` remains the source of truth for session state, but it now owns the full user-visible lifecycle through post-recording completion instead of ending the session at capture completion.

Required responsibilities:

- accept `start()` only when state is `idle`
- accept stop requests only while the session is still in capture-related states
- move to `processing` after capture finishes and a recording is dispatched
- remain non-idle until the post-recording pipeline settles or is cancelled
- expose a way to cancel only the current processing task
- publish bridge updates whenever the state changes

The key design correction is that a completed recording is no longer treated as "session is done, background work continues." The post-recording chain is part of the same session.

### 2. Pipeline Task Ownership

The main process needs one explicit handle for the current post-recording task.

Recommended ownership model:

- `ListeningSessionManager` starts the pipeline and stores a per-run processing task handle
- the handle includes an `AbortController`
- the pipeline receives that `AbortSignal`
- processing completion, failure, or user cancel settles the handle exactly once
- only settlement of that handle can transition the session from `processing` back to `idle`

This prevents `keyup`, duplicate key presses, or repeated cancel clicks from splitting the floating-window lifecycle from the real work lifecycle.

### 3. Floating Window Ownership

`WindowManager` stays a window-management service, not a state machine.

It should only be responsible for:

- ensuring the floating window instance exists
- showing the window
- hiding the window
- updating window bounds when the visible UI requires a different width

It must not decide on its own that `keyup` means the session is over.

### 4. Renderer Consumption

`FloatListening` remains a passive consumer of the bridge state:

- `listening` renders waveform
- `processing` renders `Thinking...` plus cancel
- `starting` and `stopping` may render the listening-oriented shell without introducing extra UI complexity
- `idle` and `error` are not intended to remain visible long enough to require bespoke floating UI

The renderer must not try to infer processing from timers, promises, or visibility.

## Control Flow

### Shortcut Down

Shortcut `keydown` is accepted only when session state is `idle`.

On accept:

1. show floating window
2. move session to `starting`
3. start audio capture
4. transition to `listening` once capture is live

If the state is `starting`, `listening`, `stopping`, or `processing`, the keydown is ignored.

### Shortcut Up

Shortcut `keyup` is accepted only when the state is `starting` or `listening`.

On accept:

1. request stop of audio capture
2. keep the floating window visible
3. transition to `stopping`

Once the capture stream actually ends and a recording is available:

1. dispatch the recording into the post-recording pipeline
2. transition to `processing`
3. immediately broadcast bridge state so the renderer can show `Thinking...`

If the state is already `stopping`, `processing`, or `idle`, the keyup is ignored.

### Processing Completion

When the post-recording pipeline settles:

1. clear the current processing task handle
2. hide the floating window
3. transition to `idle`
4. allow the next shortcut cycle

This applies to:

- successful LLM completion
- empty ASR result
- ASR failure
- LLM failure

### Processing Cancel

When the user clicks cancel during processing:

1. if there is no current processing task, ignore the request
2. abort the task's controller
3. hide the floating window immediately
4. clear the processing task handle
5. transition to `idle`
6. allow the next shortcut cycle

Repeated cancel clicks after the first one must be ignored.

## UI Design

### Listening State

The existing compact listening layout remains the base state:

- target app icon when available
- waveform capsule
- no cancel button

### Processing State

When state becomes `processing`, the floating window changes to a processing layout:

- the browser window width becomes `360`
- the capsule content switches from waveform to `Thinking...`
- the processing view shows a cancel affordance
- the content may change dynamically inside the window while the outer window remains at the processing width for the duration of that state

The renderer should not show a secondary explanation or progress percentage. This UI is intentionally minimal.

### `Thinking...` Timing

The floating UI must switch to `Thinking...` immediately on shortcut release, not only after storage or ASR actually begins.

Practically, this means:

- `keyup` starts the visual transition
- `stopping` and `processing` both map to the processing-oriented visual shell
- the user should perceive one seamless transition from active listening to active thinking

This avoids a dead gap where the user has already released the shortcut but the floating UI still appears to be recording.

## Shimmering Text Component

Add a reusable shimmering text component to `packages/ui/src`.

Requirements:

- exported from `packages/ui/src/index.ts`
- small, self-contained, and safe to use in desktop renderer surfaces
- accepts text children
- supports `className`
- does not encode floating-window-specific layout assumptions

The floating window should consume this shared component instead of embedding local-only shimmer styling in `float-listening.tsx`.

The goal is to adopt the visual direction of the ElevenLabs `shimmering-text` treatment without copying an entire page-specific implementation.

## Cancel Semantics

### Abort Behavior

The processing cancel action is intended to be a real abort, not a cosmetic close.

The current codebase already supports the needed direction:

- ASR recognition options accept `signal?: AbortSignal`
- LLM completion requests accept `signal?: AbortSignal`

The desktop post-recording pipeline should thread one per-run abort signal into the active ASR and LLM calls.

### History Behavior

Do not add a new `cancelled` history status for this feature.

Instead, cancelled attempts should be preserved with the existing model:

- `status: 'failed'`
- `failureMessage`: explicit user-cancel wording such as `Cancelled by user`
- `failureStage`: whichever stage was active at the moment of abort, typically `asr` or `llm`
- `debug.timeline`: include the aborted stage as a failed entry with clear cancellation wording

This keeps the data model scoped while still retaining clear debug evidence that the failure was user-initiated.

### Timing Guarantees

The floating window must hide immediately on cancel request. It must not wait for provider calls to finish unwinding before returning control to the user.

Internally, cleanup can finish asynchronously as long as:

- the session has already returned to `idle`
- shortcut input is already available again
- stale completion from the aborted task cannot re-open, re-hide, or otherwise mutate the next session

This means processing completion callbacks must be generation-safe and ignore results from stale aborted tasks.

## History And Debug Expectations

The history repository already creates a record up front in `processing` status before storage, ASR, and LLM complete.

This behavior should remain.

Expected outcomes:

- successful runs end as `completed`
- empty-transcript, provider failures, and user-cancelled attempts end as `failed`
- debug data continues to include raw transcription text, ASR and LLM request summaries, errors, and timeline entries

Cancelled runs must be distinguishable from ordinary provider failures by message text in `failureMessage` and the matching debug timeline/error entries.

## File-Level Direction

Implementation is expected to touch these areas:

- `apps/desktop/src/shared/listening-session-state.ts`
  - add `processing`
  - update helper predicates for which states are considered active or poll target app data
- `apps/desktop/src/main/listening-session.ts`
  - keep session alive through processing
  - own a per-session processing task handle
  - support cancel during processing
- `apps/desktop/src/main/post-recording-pipeline.ts`
  - accept an abort signal
  - thread the signal through ASR and LLM calls
  - treat user abort as a controlled failed outcome with explicit history/debug metadata
- `apps/desktop/src/main/index.ts`
  - stop treating shortcut key up as immediate hide
  - wire shortcut gating and processing cancel through the session service
- `apps/desktop/src/main/window-manager.ts`
  - support processing-width updates and hide only when the session settles or is cancelled
- `apps/desktop/src/preload/index.ts`
  - expose a cancel entrypoint for processing
- `apps/desktop/src/renderer/src/stores/listening-session-store.ts`
  - consume the expanded bridge API if cancel control is surfaced through the same namespace
- `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
  - render listening and processing layouts
  - show cancel only in processing
- `packages/ui/src`
  - add and export the shimmering text component

## Alternatives Considered

### 1. Separate Processing Lock Outside Listening Session

This would keep `ListeningSessionManager` capture-only and add a parallel boolean such as `isProcessingPostRecording`.

It is rejected because:

- session truth would be split across two different sources
- floating UI would need to compose listening state and processing lock manually
- shortcut gating would become easier to desynchronize from renderer state

### 2. Promise-Driven `keyup` Patch

This would leave the existing state model intact and manually delay `hideFloating()` until `postRecordingPipeline.process()` settles.

It is rejected because:

- processing would still not be a first-class observable state
- cancel support would have no clean ownership boundary
- repeated key events would still be managed by implicit promise timing instead of explicit session state

### 3. Add `cancelled` As A New History Status

This would make cancelled attempts visibly distinct in the data model.

It is rejected for now because:

- the current requirement is debug retention, not taxonomy expansion
- adding a new status would broaden scope into history rendering and filtering
- `failed` plus explicit cancellation messaging already satisfies the product need

## Testing Strategy

### Main-Process Session Tests

Extend `ListeningSessionManager` tests to verify:

- `keyup` does not end the session immediately
- capture completion transitions from `stopping` to `processing`
- the session remains non-idle while the post-recording task is still running
- duplicate shortcut input is ignored during `starting`, `listening`, `stopping`, and `processing`
- processing completion returns the session to `idle`
- processing cancel returns the session to `idle` and ignores repeated cancel

### Pipeline Tests

Add or update tests to verify:

- ASR receives the pipeline abort signal
- LLM receives the pipeline abort signal
- user abort is written as a failed history outcome with explicit cancellation wording
- stale aborted completion cannot mutate the next session

### Window And Wiring Tests

Add tests around the desktop wiring to verify:

- shortcut `keyup` no longer directly hides the floating window
- floating window remains visible through processing
- floating window hides on settle
- floating window hides immediately on cancel
- processing width changes to `360` while processing is visible

### Renderer Tests

Add or update renderer tests to verify:

- listening state renders waveform
- processing state renders `Thinking...`
- processing state shows cancel
- non-processing states do not show cancel
- the renderer does not need timers or local promise tracking to switch states

### UI Package Tests

Add tests for the new shimmer component to verify:

- children render correctly
- caller-provided classes merge correctly
- the component can be imported from `@openbroca/ui`

## Acceptance Criteria

The feature is complete when all of the following are true:

1. pressing the shortcut shows the floating listening UI and starts capture
2. releasing the shortcut immediately switches the floating UI into `Thinking...` instead of hiding it
3. while processing is active, extra shortcut presses and releases do nothing
4. successful LLM completion hides the floating window and unlocks the next recording
5. empty ASR result, ASR failure, and LLM failure also hide the floating window and unlock the next recording
6. while processing is active, cancel is visible and clicking it aborts the current work
7. cancel hides the floating window immediately, returns the session to `idle`, and allows the next shortcut cycle
8. cancelled attempts remain in history as failed records with explicit cancellation wording
9. the floating processing UI uses a shared shimmer component from `packages/ui/src`
10. the processing window width is `360`

## Risks And Guardrails

The main correctness risk is stale async completion from a previous aborted task interfering with the next session.

Guardrails:

- processing tasks need per-run identity or generation tracking
- only the currently active task may transition the session back to `idle`
- stale completion from an older task must be ignored after cancel or after a newer session starts

The main UX risk is making processing feel disconnected from release timing.

Guardrail:

- map the release moment directly to the processing visual transition so the user sees continuous progress from listening to thinking
