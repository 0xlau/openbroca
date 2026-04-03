# Instructions And App Identity Design

**Date:** 2026-04-03

## Goal

Add a reusable desktop app identity layer and a new `Instructions` feature for the desktop app.

The immediate product goal is:

- users can create multiple instruction entries
- each instruction has a `name`
- each instruction can bind multiple activation apps
- each bound app can belong to only one instruction across the whole app
- each instruction stores `Custom instructions`
- each instruction stores an `Auto enter` switch that triggers automatic send behavior when that instruction matches the current frontmost app

The engineering goal is to split this work into two layers with clear ownership:

- `packages`: cross-platform app identity discovery and normalization
- `apps/desktop`: instruction rule structure, persistence, validation, UI, and runtime matching

## Scope

This design covers:

- a new reusable package for app identity discovery
- a new desktop `Instructions` page
- instruction persistence and normalization
- system app selection plus manual app entry
- frontmost app matching behavior

This design does not yet cover:

- a generalized instruction system for non-desktop targets
- a standalone native addon strategy
- a final send-pipeline refactor beyond consuming the matched instruction result

## Decision Summary

The work will be split into two implementation domains.

### Shared Package

A new package will provide:

- app identity types
- cross-platform normalization
- app catalog discovery
- frontmost app lookup

This package is responsible for platform differences and for producing stable app identity records that desktop features can consume.

### Desktop App

The desktop app will provide:

- `InstructionRule` types
- persistence and migration logic
- uniqueness validation for activation apps
- the `/instructions` page and its dialogs or forms
- runtime instruction matching
- wiring of `customInstructions` and `autoEnter` into the desktop send flow

This intentionally keeps product-specific rule semantics out of shared packages.

## Why This Split

`AppIdentity` is a good shared abstraction because:

- platform discovery is difficult and should not be reimplemented in each app
- app identity records can be reused by future desktop features beyond instructions
- stable app keys and metadata normalization belong close to platform access

`InstructionRule` stays in `apps/desktop` because:

- its meaning depends on desktop behavior
- `autoEnter` is a desktop send semantic, not a generic domain concept
- the uniqueness rule that one app can only belong to one instruction is a product rule for this app

This split avoids a weak shared abstraction that would only mirror current desktop behavior.

## Shared Package Design

### Package Responsibility

Recommended package name:

- `packages/app-identity`

This package will expose a desktop-oriented API surface that Electron main process code can call.

### Core Types

Recommended shared types:

```ts
type AppPlatform = 'macos' | 'windows'

type AppIdentitySource = 'detected' | 'manual'

type AppIdentity = {
  id: string
  displayName: string
  platform: AppPlatform
  bundleId?: string
  aumid?: string
  path?: string
  iconDataUrl?: string
  source: AppIdentitySource
}

type FrontmostAppResult = AppIdentity | null
```

### Stable Identity Rules

The shared package will normalize app ids as follows:

- macOS: use `bundleId` as the stable id when available
- Windows: use `aumid` when available
- Windows fallback: use executable `path`

The package may also return the original fields used to derive the id so the desktop app can show them in the UI and support manual correction.

Display names are never used as the persisted identity key.

### Discovery Responsibilities

The package will expose two entry points:

- `listApps()`
- `getFrontmostApp()`

`listApps()` returns the catalog used by the instructions UI.

`getFrontmostApp()` returns the app used by the runtime matcher.

### Platform Behavior

#### macOS

For the first version:

- `getFrontmostApp()` uses the native frontmost application API
- `listApps()` combines running applications with common application directories
- icon lookup can be completed from the resolved app path

The expected result is a relatively complete catalog for typical desktop usage.

#### Windows

For the first version:

- `getFrontmostApp()` resolves the foreground window owner process
- `listApps()` aggregates a practical user-facing catalog instead of attempting a full disk scan
- preferred sources are current running apps plus user-visible app entry points
- icon lookup is derived from the resolved executable path

This deliberately favors usable app selection over exhaustive enumeration.

## Desktop Instruction Design

### Data Model

The desktop app will define its own instruction rule types.

Recommended shape:

```ts
type InstructionActivationApp = {
  id: string
  displayName: string
  platform: 'macos' | 'windows'
  bundleId?: string
  aumid?: string
  path?: string
  iconDataUrl?: string
  source: 'detected' | 'manual'
}

type InstructionRule = {
  id: string
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnter: boolean
  createdAt: string
  updatedAt: string
}

type InstructionsSettings = {
  rules: InstructionRule[]
}
```

Default persisted value:

```ts
{
  rules: []
}
```

### Rule Constraints

The desktop app will enforce these invariants:

- each rule must have a non-empty `name`
- `activationApps` may contain multiple apps
- an app id may only appear in one rule across the entire store
- `customInstructions` may be empty and is stored as an empty string when omitted
- `autoEnter` is stored per rule and only affects behavior when that rule matches

### Persistence Strategy

The feature will use the existing renderer pattern:

- a dedicated persisted store created with `createPersistedStore`
- a store key dedicated to instructions
- renderer hydration via the generic TRPC store router

Normalization should:

- backfill missing fields
- coerce malformed rule arrays to an empty array
- trim empty names
- remove invalid activation apps with empty ids
- preserve stable ordering
- resolve duplicate app ownership by keeping the earliest surviving rule entry and dropping later conflicting bindings

The UI should surface duplicate ownership failures during save rather than relying only on silent normalization.

## UI Design

### Route

The existing navigation entry for `Instructions` will be backed by a real route:

- `/instructions`

### Page Structure

The page should mirror the existing main-page pattern used by other desktop settings pages:

- page header
- short supporting copy
- primary action to create a new instruction
- list of existing rules

Each rule row should show:

- `name`
- number of bound apps
- `autoEnter` state
- a short preview of `customInstructions`

Each row should support:

- edit
- delete

### Editor Fields

The create and edit experience will include:

- `Name`
- `Activation apps`
- `Custom instructions`
- `Auto enter`

The `Auto enter` field should use the provided product meaning:

- `Simulates pressing a send key after processing.`

### Activation Apps Selector

The app selector should support:

- searching detected apps
- choosing multiple apps
- showing icon, display name, and secondary identity text
- showing when an app is already owned by another instruction
- manual app entry

Apps already assigned to another instruction must be disabled for selection and explained in the UI.

When editing a rule, apps already bound to that same rule remain selectable.

### Manual App Entry

Manual entry exists as an advanced fallback, not the primary path.

Recommended fields:

- `Display name`
- `Platform`
- `Stable ID`

Optional advanced fields:

- `bundleId`
- `aumid`
- `path`

Manual entries are normalized into the same activation app shape as detected entries so the runtime matcher only has one comparison model.

## Runtime Matching Design

### Match Flow

At runtime the desktop app will:

1. resolve the current frontmost app through the shared package
2. compare the returned `id` against all instruction `activationApps`
3. select the unique matching rule, if any
4. pass that rule's `customInstructions` and `autoEnter` into the send pipeline

Because app ownership is globally unique, runtime matching should resolve to zero or one rule.

### Match Result

Recommended desktop-facing helper:

```ts
type MatchedInstruction = {
  ruleId: string
  name: string
  customInstructions: string
  autoEnter: boolean
} | null
```

The runtime should not need full editor metadata once a rule is matched.

### Error Handling

If frontmost app lookup fails:

- the app should continue normally without a matched instruction
- the failure should not block the user from sending input

If the app catalog fails to load:

- the instructions page should still open
- manual entry must remain available
- the user should see a clear loading or failure state for detected apps

## Testing Strategy

### Shared Package Tests

Add unit tests for:

- stable id normalization by platform
- detected record normalization
- manual record normalization
- fallback behavior when preferred identity fields are missing

### Desktop Store Tests

Add tests for:

- default instruction store shape
- hydration and normalization
- duplicate app ownership pruning
- rule update behavior
- manual entry persistence

### Renderer Page Tests

Add tests for:

- rendering an empty instructions page
- creating a rule
- editing a rule
- preventing selection of apps owned by another rule
- deleting a rule
- displaying `autoEnter`

### Runtime Tests

Add tests for:

- frontmost app resolves no match
- frontmost app resolves a matching rule
- matched rule returns `customInstructions` and `autoEnter`
- lookup failures fall back safely

## Implementation Notes

The implementation phase should be done in a dedicated git worktree, per user preference.

This applies to code changes for the shared package, desktop main process wiring, renderer UI, and tests. The design document itself can be committed independently before that implementation work begins.

## Open Decisions Closed In This Spec

The following product choices are now explicit:

- one instruction can bind multiple apps
- one app can belong to only one instruction
- `name` is required on every instruction
- `autoEnter` is evaluated per matched instruction
- users should primarily choose from detected apps and use manual entry as a fallback
- app identity discovery belongs in `packages`
- instruction rules belong in `apps/desktop`
