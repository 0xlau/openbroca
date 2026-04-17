# Target-App Instruction Delivery Design

**Date:** 2026-04-17

## Goal

Finish the last stage of the desktop post-recording voice flow after LLM generation completes.

The product goal is:

- when the user focus is inside a third-party editable input, deliver the final LLM text directly into that input
- when delivery to an editable input is not safe or not possible, copy the final LLM text to the system clipboard
- surface clipboard fallback through a dedicated notify window instead of a renderer toast
- let `Instructions` rules shape both the LLM prompt and the final auto-send behavior

The engineering goal is:

- make `FloatListening`, instruction matching, and final text delivery use the same target-app detection semantics
- separate text delivery from the ASR -> LLM pipeline so prompt construction, input delivery, send-key simulation, and notify UI can evolve independently
- preserve a complete debug trail for how each final result was delivered

## Scope

This design covers:

- matching instruction rules against the focused editable target app
- including matched `customInstructions` in the post-recording LLM system prompt
- delivering final LLM text into the currently focused editable input when possible
- re-checking the target app at delivery time before any automatic send
- falling back to clipboard when input delivery is not possible or no longer safe
- notifying the user through a dedicated notify window
- debug data and test coverage for the new delivery path

This design does not cover:

- streaming partial LLM output into third-party apps
- editing `Instructions` UI behavior beyond using its existing fields
- a full action center or persistent notification history
- cross-device clipboard sync
- retries, undo, or manual resend buttons in the first implementation

## Current State

The desktop app already has the main pieces of the voice pipeline:

- `ListeningSessionManager` captures audio and publishes `targetApp` for the floating window
- `FocusedInputAppService` detects whether the current focus is inside an editable control and resolves the owning app identity
- `PostRecordingPipeline` runs storage, ASR, prompt construction, LLM cleanup, and history updates
- `InstructionMatcher` already resolves a single matching rule and exposes `customInstructions` and `autoEnterMode`
- `AutoEnterService` can simulate `Enter` or `Cmd/Ctrl+Enter`

Current gaps:

- instruction matching still uses frontmost-app semantics instead of the focused editable target-app semantics shown in the floating window
- the final LLM text is stored in history but is not delivered into the user's current input field
- clipboard fallback behavior does not exist
- user feedback for delivery outcomes does not exist
- auto-enter currently assumes text is already present in the target app, but the app never injects the final text itself

## Product Decisions

The following decisions are fixed by this design:

- instruction rules are matched against the focused editable target app, not merely the frontmost app
- the rule used for prompt construction is locked from the target-app snapshot captured when recording completes
- final delivery re-checks the current target app before any automatic send
- if the current target app no longer matches the rule used during prompt construction, the app falls back to clipboard instead of sending into the new target
- when no instruction rule matches, the app still attempts direct text delivery into the current editable input; instructions only control prompt augmentation and send-key behavior
- clipboard feedback is shown through a single-instance notify window that replaces its current content instead of stacking multiple windows

## Decision Summary

The desktop app will add a dedicated final-text delivery layer after LLM success.

The full post-recording flow becomes:

`shortcut release -> capture stops -> target-app snapshot captured -> instruction matched from target-app snapshot -> prompt built -> ASR -> LLM -> final text delivery re-checks current target app -> inject text if safe -> optional auto-send -> otherwise clipboard fallback -> notify window feedback`

This design introduces one new bounded service and one new window family:

1. target-app based instruction matching
2. `FinalTextDeliveryService`
3. single-instance `notify-window`

This keeps prompt-time decisions, delivery-time decisions, and feedback presentation separate.

## Shared Semantics

### Target App Definition

`targetApp` means:

- the app that owns the currently focused editable control
- `null` when no editable control is focused

This is the same semantic already used by `FloatListening`.

The rest of the voice feature must align to that same definition:

- floating UI display
- instruction rule matching
- delivery-time safety checks

If these surfaces use different app-resolution semantics, the user can see one app in the floating UI while the prompt or send behavior is driven by another app. This design forbids that split.

### Two App Snapshots

The system must treat two target-app observations as distinct:

- `targetAppAtMatch`: the target-app snapshot captured when recording completes and before prompt construction
- `targetAppAtDelivery`: the target-app snapshot resolved again after LLM success, immediately before final delivery

Rules:

- `targetAppAtMatch` decides which instruction rule shapes the prompt
- `targetAppAtDelivery` decides whether final text can still be injected and whether automatic send is still allowed

This keeps prompt behavior stable during processing while still honoring the user's later focus changes.

## Architecture

### 1. `FocusedInputAppService`

`FocusedInputAppService` remains the source of truth for target-app resolution.

Responsibilities:

- detect whether the current focus is inside an editable control
- resolve the owning app identity
- fall back safely when focused-input resolution fails

New expectation:

- all instruction matching and delivery-time checks must consume this service or a snapshot previously produced by this service

### 2. `InstructionMatcher`

`InstructionMatcher` keeps its existing single-match behavior but changes its semantic input.

New contract:

- accept a target-app snapshot directly
- treat that snapshot as the app to match against `activationApps`
- not perform implicit frontmost-app resolution when the caller already has a target-app snapshot

Matching rules stay conservative:

- zero matches => no instruction
- more than one match => no instruction
- exactly one match => use that rule

The resolved payload remains:

- `ruleId`
- `name`
- `customInstructions`
- `autoEnterMode`

### 3. `PostRecordingPipeline`

`PostRecordingPipeline` keeps ownership of:

- durable history record creation
- ASR and LLM orchestration
- prompt construction
- overall success or failure state

New behavior:

- capture `targetAppAtMatch` from the recording payload
- resolve the matched instruction from `targetAppAtMatch`
- include matched `customInstructions` in the LLM system prompt
- after successful LLM completion, call `FinalTextDeliveryService`
- store structured delivery debug data

`PostRecordingPipeline` no longer directly models the final behavior as "LLM success plus optional auto-enter only." It must model the full delivery outcome.

### 4. `FinalTextDeliveryService`

`FinalTextDeliveryService` is the new main-process service introduced by this design.

Responsibilities:

- re-resolve `targetAppAtDelivery`
- decide whether direct injection is allowed
- inject final text into the focused input when allowed
- optionally trigger `AutoEnterService`
- fall back to clipboard when injection is not allowed or fails
- return a structured delivery result for history/debug and notify-window display

Dependencies:

- `FocusedInputAppService`
- a text-injection mechanism for the focused editable input
- system clipboard access
- `AutoEnterService`
- a notify-window controller for clipboard-fallback feedback

The service owns delivery policy. `PostRecordingPipeline` should not replicate those rules.

### 5. `NotifyWindows`

The app will add a separate notify-window family, parallel to the floating window setup.

Recommended structure:

- `apps/desktop/src/main/windows/notify-window.ts`
- `apps/desktop/src/main/notify-windows.ts`
- `apps/desktop/src/renderer/src/pages/notify/...`

Responsibilities:

- display one transient delivery notification at a time
- replace current content when a newer notification arrives
- auto-dismiss after a short timeout
- keep layout ready for future action buttons

The first implementation only needs clipboard-fallback feedback, but the UI contract should already allow future button rows.

## Delivery Policy

### Prompt-Time Rule Selection

When recording completes:

1. capture `targetAppAtMatch`
2. resolve the matched instruction from `targetAppAtMatch`
3. if one rule matches:
   - include `customInstructions` in the cleanup prompt
   - persist the matched rule metadata in debug
4. if no rule matches:
   - build the standard cleanup prompt without matched instruction content

The prompt-time matched rule does not change afterward, even if the user changes focus while ASR or LLM work is in progress.

### Delivery-Time Resolution

After LLM returns non-empty final text:

1. resolve `targetAppAtDelivery`
2. if `targetAppAtDelivery` is `null`, copy to clipboard and show notify window
3. if an instruction matched at prompt time, verify that `targetAppAtDelivery` still matches the same app identity family as the matched rule
4. if an instruction matched and the app no longer matches that rule, copy to clipboard and show notify window
5. otherwise attempt direct text injection into the currently focused editable input
6. if text injection fails, copy to clipboard and show notify window
7. if text injection succeeds:
   - if no instruction matched at prompt time, stop here
   - if instruction matched with `autoEnterMode = off`, stop here
   - if instruction matched with `autoEnterMode = enter | mod-enter`, trigger the configured send key

This preserves the user's explicit app-targeting rule: once a prompt-time instruction is app-specific, the final result must only be delivered back into that same app family. If that condition no longer holds, delivery degrades to clipboard instead of injecting into a different app.

### Default Behavior Without Instructions

If no instruction rule matched:

- the app still attempts to inject the final text into the current editable input
- no automatic send is performed
- clipboard fallback still applies if injection is unavailable

Instructions do not gate delivery. They only gate prompt augmentation and send-key behavior.

## App Identity Matching Rules

The same app-identity comparison logic should be used in:

- instruction matching at prompt time
- delivery-time safety check before auto-send

Approved stable identifiers are:

- `id`
- `bundleId`
- `aumid`
- `path`

The check remains:

- if any stable identifier matches, treat the apps as the same target family
- if none match, treat them as different apps

This mirrors the existing matcher behavior and avoids introducing a second identity model.

## Text Injection Strategy

The delivery layer needs a text-injection step before any send key is triggered.

Requirements:

- injection must target the current focused editable input
- injection must happen before `AutoEnterService`
- injection must be treated as its own success/failure boundary
- injection must not rely on the target app already containing the final text

The design intentionally leaves the platform-specific injection mechanism open so implementation can choose the narrowest reliable mechanism per platform. The service contract must not assume one specific transport such as simulated paste versus direct accessibility value mutation.

What is fixed by this design is the policy:

- successful injection may be followed by optional send
- failed injection must degrade to clipboard fallback

## Notify Window Behavior

The notify window is a single-instance transient window.

Behavior:

- only one notify window exists at a time
- showing a new notification replaces the current notification content
- notifications auto-dismiss after a short duration
- no stacking behavior exists in the first version

The initial content model should support:

- title
- optional body text
- optional app label
- reserved button area for future actions

First-version use case:

- title: `Copied to clipboard`
- optional body: the destination could not be updated directly

The notify window must not block keyboard focus from returning to the third-party app.

## Data Model And Debug

History debug data should gain a dedicated delivery section.

Recommended shape:

```ts
type DeliveryDebug = {
  targetAppAtMatch: AppIdentity | null
  targetAppAtDelivery: AppIdentity | null
  matchedInstruction: {
    ruleId: string
    name: string
    autoEnterMode: 'off' | 'enter' | 'mod-enter'
  } | null
  method: 'inject-only' | 'inject-and-send' | 'clipboard'
  status: 'completed' | 'fallback' | 'failed'
  autoSendTriggered: boolean
  failureMessage?: string
}
```

Guidelines:

- `targetAppAtMatch` records the app used to select instructions
- `targetAppAtDelivery` records the app that existed when the result was actually delivered
- `method` records the final user-visible outcome
- `status` distinguishes normal success from fallback behavior

This data belongs under the existing history debug object instead of becoming top-level history summary fields.

## Failure Model

### Pipeline Failures

The existing rules remain:

- storage failure => record `failed`
- ASR failure => record `failed`
- LLM failure => record `failed`

### Delivery Failures

LLM success and delivery failure are separate concerns.

Rules:

- if LLM succeeds and clipboard fallback succeeds, the overall pipeline remains `completed`
- if direct injection fails but clipboard fallback succeeds, record `completed` with delivery `status = fallback`
- if direct injection succeeds but auto-send fails, record `completed`; do not remove the injected text
- if notify-window display fails, log it but do not change the delivery result
- if both direct injection and clipboard fallback fail, record `completed` with delivery `status = failed` and a precise `failureMessage` in debug

This design intentionally keeps history centered on ASR/LLM production success, while making delivery diagnostics explicit.

## Testing Strategy

### Main-Process Unit Tests

Add focused tests for:

- target-app based instruction matching with zero, one, and multiple matches
- prompt construction includes `customInstructions` only when exactly one target-app rule matches
- delivery path injects text and stops when no instruction matched
- delivery path injects text and then triggers `enter`
- delivery path injects text and then triggers `mod-enter`
- delivery path injects text but suppresses auto-send when the current target app no longer matches the matched instruction app
- delivery path falls back to clipboard when no editable target exists
- delivery path falls back to clipboard when injection fails
- notify-window controller replaces the current notification instead of stacking

### Renderer Tests

Add focused tests for:

- notify page renders notification title/body
- notify page renders a reserved action area when action metadata exists

### Verification Commands

Expected verification stays package-local and desktop-focused:

- focused Vitest coverage for `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
- focused Vitest coverage for new delivery and notify-window tests
- `pnpm --filter desktop typecheck`

If broader workspace checks fail for unrelated historical reasons, those failures should be called out separately and must not block this scoped feature design.

## Implementation Notes

Recommended file touch points:

- `apps/desktop/src/main/focused-input/service.ts`
- `apps/desktop/src/main/instructions/matcher.ts`
- `apps/desktop/src/main/post-recording-pipeline.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/windows/index.ts`
- new delivery service files under `apps/desktop/src/main`
- new notify-window files under `apps/desktop/src/main/windows`
- new notify renderer page and route under `apps/desktop/src/renderer/src/pages/notify`

The implementation should stay scoped to the desktop app and should not change `Instructions` editor UX unless a wiring gap forces it.

## Risks And Mitigations

### Risk: Prompt app and delivery app drift

If prompt-time rule selection and delivery-time checks are based on different app semantics, users will see inconsistent behavior.

Mitigation:

- source both from `FocusedInputAppService`
- record both snapshots explicitly in debug

### Risk: Auto-send into the wrong app after focus change

If the user changes focus while the LLM is running, a stale rule could send into the wrong destination.

Mitigation:

- re-check `targetAppAtDelivery`
- only auto-send when it still matches the same instruction app family

### Risk: Delivery failures become invisible

If clipboard fallback happens silently, users may think nothing happened.

Mitigation:

- always display clipboard fallback through notify window
- record delivery details in history debug

### Risk: Notify UI grows into a second floating-window codepath with inconsistent behavior

Mitigation:

- keep notify window single-purpose and single-instance
- mirror the existing main/window split used by floating window without sharing unrelated state machines

## Rollout

Ship this as one bounded desktop change:

1. align instruction matching with target-app semantics
2. add final text delivery service
3. wire clipboard fallback and notify window
4. add focused tests

No migration is required for stored instruction data because the rule schema does not change. Only the runtime matching semantic changes from frontmost-app matching to target-app matching.
