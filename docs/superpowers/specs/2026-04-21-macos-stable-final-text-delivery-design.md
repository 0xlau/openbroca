# macOS Stable Final-Text Delivery Design

**Date:** 2026-04-21

## Goal

Replace the current macOS final-text delivery experiment with a simpler and more stable delivery model:

- use clipboard paste as the only cross-app insertion mechanism
- keep `Instructions` target-app ownership as the safety boundary
- keep `auto-enter`
- stop depending on Accessibility-focused input detection for delivery

The product goal is no longer "verified direct insertion." The product goal is:

**reliable final-text handoff into the intended app with the smallest possible platform surface area.**

## Scope

This design covers:

- macOS only
- final-text delivery after LLM completion
- clipboard-backed paste delivery
- `Instructions` target-app matching and re-check at delivery time
- conditional inclusion of app-specific instruction prompt text
- optional auto-send through existing `auto-enter`
- delivery debug semantics and notify behavior

This design does not cover:

- Windows delivery redesign
- Accessibility-based direct value writes
- focused-element or editable-control detection
- app-specific Feishu, WeChat, Slack, Notion, Chrome, or VS Code adapters
- partial-stream delivery
- notify-window redesign

## Product Priority

The accepted priority order for this design is:

1. stability over sophistication
2. predictable app ownership over optimistic insertion
3. paste delivery over platform-specific heuristics

In practice this means:

- we prefer one stable paste path over multiple "smart" native paths
- we keep the app-target constraint
- we accept that clipboard paste cannot prove landing in the exact field

## Current Problem

The current design direction relies on macOS Accessibility to discover a focused editable element and, when possible, write directly to it.

That approach is too unstable for the actual target environments:

- some apps do not expose a useful focused element
- some apps expose frontmost-app identity but not a writable focused input
- some apps intermittently fail AX messaging even when accessibility permission is granted
- debugging becomes dominated by platform quirks rather than product behavior

The result is a complicated system with many fallback branches, but the user still often ends up with clipboard fallback.

From first principles, the simplest stable primitive that works across apps is:

**copy the final text to the clipboard, paste it, and optionally send it.**

## Design Summary

The new macOS delivery architecture collapses to one delivery primitive:

1. **clipboard write**
2. **generic paste**
3. **optional auto-enter**

There is no Accessibility helper in the delivery path.

The only gating logic that remains is app ownership:

- `Instructions` still decide which target app a recording belongs to
- the app is re-checked at delivery time
- that result determines whether app-specific instructions apply and whether auto-send is allowed

## Core Behavior

### 1. Matching Still Uses Target App

Prompt-time behavior remains app-aware.

The system still:

- captures the frontmost app during recording / handoff
- resolves `matchedInstruction`
- stores `targetAppAtMatch`

This part does not change.

### 2. Delivery Uses Clipboard Paste Only

On macOS, final-text delivery no longer attempts:

- AX focused-element inspection
- AX direct value writes
- AX value-settable checks
- editability heuristics

Instead, delivery uses:

- clipboard snapshot
- clipboard write of final text
- generic paste shortcut
- clipboard restore

### 3. App Ownership Still Matters

At delivery time, the app re-check remains:

- if the current frontmost app matches the matched target app, delivery may paste and may auto-send
- if the current frontmost app does not match the matched target app, delivery may still copy to clipboard, but must not auto-send

This keeps `Instructions` as the ownership mechanism even though the insertion primitive is simplified.

## Prompt Composition Rule

This design changes one important prompt rule:

**app-specific `Instructions.customInstructions` are only appended when the current frontmost app at delivery time still matches the matched target app.**

That means:

- matched rule + current app still matches -> append custom instructions
- matched rule + current app no longer matches -> do not append custom instructions
- no matched rule -> no app-specific instructions

This keeps app-specific prompt shaping aligned with the app that will actually receive the pasted text.

## Delivery Matrix

### Case A: Matched App And Current App Still Match

Conditions:

- a rule matched
- current frontmost app at delivery time matches the rule's activation app

Behavior:

- append the matched rule's custom instructions
- write final text to clipboard
- send paste shortcut
- if `auto-enter` is enabled, send enter / mod-enter

Expected result:

- best-effort paste into the intended app
- optional send remains allowed

### Case B: Matched App But Current App Changed

Conditions:

- a rule matched
- current frontmost app at delivery time no longer matches the matched target app

Behavior:

- do not append the matched rule's custom instructions
- write final text to clipboard
- do not auto-send

This design accepts the user's explicit requirement that paste should still happen, but send must not happen.

### Case C: No Matched Rule

Conditions:

- no rule matched

Behavior:

- no app-specific instructions
- write final text to clipboard
- paste into the current frontmost app
- do not auto-send

## Why Paste Is Still Allowed When The App Changed

This is a deliberate product choice from the approved design discussion.

If the app changed between match time and delivery time:

- the system should not send automatically
- the system should not use app-specific prompt guidance
- but it may still paste the cleaned final text into the current app

This keeps the user moving forward while preventing the riskiest behavior, which is unintended automatic send.

## Success Semantics

This design removes `ax-direct-success` entirely from the macOS product model.

The only accepted delivery outcomes are:

### A. `paste-success`

Conditions:

- clipboard write succeeded
- paste shortcut was issued without command failure

This is still a best-effort outcome. It means the app issued paste; it does not claim field-level proof.

### B. `clipboard-fallback`

Conditions:

- paste was intentionally skipped, or
- paste/send was disallowed by ownership rules, or
- paste command failed but clipboard write succeeded

This remains a successful preservation outcome.

### C. `delivery-failed`

Conditions:

- clipboard write failed

This should remain rare.

## Core Rule

The new core rule is:

**macOS delivery does not attempt to prove field-level landing.**

The system should honestly represent what it did:

- copied
- pasted
- auto-sent or did not auto-send

It should not imply focused-input certainty that the platform cannot reliably provide.

## Delivery Data Model

The delivery debug payload should now reflect clipboard/paste semantics rather than AX semantics.

Required evidence categories:

- target app at match
- target app at delivery
- whether strict ownership matched at delivery time
- whether app-specific instructions were appended
- attempted strategy
- outcome
- whether paste was attempted
- whether auto-send was triggered
- fallback reason when applicable

`focusedElement`, AX role data, and AX writability are no longer required for the steady-state design.

## Recommended Outcome Semantics

The product-level fields should converge toward:

- `method`: `paste` or `clipboard`
- `status`: `completed`, `fallback`, or `failed`
- `outcome`: `paste-success`, `clipboard-fallback`, or `delivery-failed`
- `autoSendTriggered`: boolean
- `fallbackReason`: explicit reason

If old AX-oriented fields remain temporarily for migration reasons, they should be treated as compatibility baggage rather than active behavior.

## Fallback Reasons

The design expects explicit fallback reasons such as:

- `target-mismatch`
- `no-matched-instruction`
- `paste-command-failed`
- `clipboard-write-failed`
- `auto-send-disallowed`

The exact enum can be refined in implementation, but the reason should describe product behavior, not AX internals.

## Clipboard Handling

Clipboard handling remains important:

- snapshot clipboard contents before paste flow
- write final text to clipboard
- send paste shortcut when allowed
- restore clipboard afterward when practical

The system should minimize clipboard disruption while keeping the delivery path simple.

## Auto-Enter Rule

`auto-enter` remains supported, but only in the safe ownership case:

- current frontmost app matches matched target app
- matched rule exists
- rule enables auto-enter

If the app changed, `auto-enter` must not run.

## Why AX Is Removed Entirely

From first principles, AX is not the core user value here.

The core user value is:

- get the cleaned final text into the intended app
- do it predictably
- avoid surprising sends

Accessibility-based focused-element inspection adds:

- platform fragility
- app-specific edge cases
- misleading success/failure states
- large debugging surface area

Clipboard paste is less ambitious, but more robust.

That trade-off is the accepted direction.

## Expected Outcomes

After this design lands:

- macOS delivery becomes much simpler
- cross-app behavior becomes more predictable
- `Instructions` still control ownership and optional sending
- app-specific prompt text is only applied when the current app still matches
- delivery debug becomes more honest about what actually happened

The main product improvement is:

**stop depending on unstable focused-element detection and standardize on one stable paste path.**
