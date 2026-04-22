# Desktop Permission Onboarding Design

**Date:** 2026-04-22

## Goal

Add a blocking permission onboarding flow for the desktop app so that on macOS the user cannot enter the main window until all required permissions are granted.

The first version must:

- block `main window` creation on macOS until all required permissions pass
- show a dedicated permission onboarding window instead
- allow the user to quit the app, but not bypass onboarding
- re-check permissions on the next launch instead of forcing a live fallback from main window

## Scope

This design covers:

- `apps/desktop` only
- macOS startup gating
- a dedicated permission onboarding window
- required permissions for the current desktop product surface
- main-process permission checks, requests, and window routing
- renderer onboarding UI and interaction model

This design does not cover:

- Windows permission onboarding
- camera permission gating
- runtime ejection from the main window after permissions are revoked
- a generic cross-platform onboarding framework
- post-onboarding feature walkthroughs or provider setup

## Confirmed Product Decisions

The user confirmed these rules:

- Windows does not need permission onboarding
- macOS must block entry to the main window until all required permissions are granted
- the user may close the app from onboarding, but may not continue into the main window while permissions are incomplete
- if permissions are later revoked while the app is already open, the app only re-checks and re-blocks on the next launch
- the onboarding UI must follow the repo's shadcn-style conventions and use components from `packages/ui`

## Current State

The current desktop startup flow in [`apps/desktop/src/main/index.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/index.ts) always creates the main window once Electron is ready.

There is currently:

- no permission gate before `windowManager.createMain()`
- no onboarding window in the main-process window layer
- no renderer route for permission onboarding

The current codebase shows these relevant signals:

- microphone usage is a real product dependency
- macOS packaging already declares microphone and camera usage descriptions in [`apps/desktop/electron-builder.yml`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/electron-builder.yml)
- camera is not currently used by the desktop runtime and should not be included in the blocking list
- macOS final-text delivery uses `osascript` with `System Events` for paste, so desktop-control capability is a real product dependency

## Decision Summary

Add a main-process `permission gate` on macOS and make window creation conditional on its result.

Startup behavior becomes:

- macOS + all required permissions granted -> create `main window`
- macOS + any required permission missing -> create `permission onboarding window` only
- Windows -> keep the existing startup path and create `main window` directly

The onboarding UI should present two required capabilities:

- `Microphone`
- `Desktop Control`

`Desktop Control` is the product-facing name. Internally, the first implementation maps it to the macOS Accessibility trust check rather than exposing raw system terminology in the UI.

## Permission Model

Define a small permission domain model with fixed keys and normalized states.

Proposed keys:

- `microphone`
- `desktopControl`

Proposed normalized states:

- `granted`
- `missing`
- `needs-manual-step`
- `error`

The renderer should never infer these states by itself. The main process owns the mapping from platform APIs to the normalized state model.

## Required Permissions

### 1. Microphone

This is a real hard requirement for the current desktop recording flow.

Main-process behavior:

- check with `systemPreferences.getMediaAccessStatus('microphone')`
- request with `systemPreferences.askForMediaAccess('microphone')`

State mapping:

- `granted` -> `granted`
- `not-determined` -> `missing`
- `denied` or `restricted` -> `needs-manual-step`

Notes:

- if the user has already denied microphone access, the app should not pretend a local retry will fix it
- the onboarding copy should tell the user that system settings may require quitting and reopening the app before the new state is visible

### 2. Desktop Control

This is the product-facing permission for the current macOS cross-app desktop-control path.

For the first version, it should map to the Accessibility trust check only.

Main-process behavior:

- check with `systemPreferences.isTrustedAccessibilityClient(false)`
- guide with `systemPreferences.isTrustedAccessibilityClient(true)` and a system-settings deep link when needed

State mapping:

- trusted -> `granted`
- not trusted -> `needs-manual-step`

Why this is the chosen first boundary:

- it is a stable and explicit macOS permission surface
- the current desktop control path already depends on system-level interaction privileges
- it avoids turning the first onboarding version into a vague bucket of multiple platform internals that cannot all be checked reliably

## Window Flow

Add a dedicated onboarding window instead of reusing the main window router as a fake gate.

Required behavior:

1. Electron becomes ready
2. main process resolves the permission snapshot
3. if gating is not needed, create `main window`
4. if gating fails, create `permission onboarding window` only
5. the onboarding window drives permission request, settings navigation, and refresh
6. once all required permissions are granted, the main process closes the onboarding window and creates the main window

The onboarding window may be closed by the user. Closing it should exit the application rather than silently creating the main window.

## UI Structure

The onboarding UI must follow existing repo conventions:

- use shadcn-style primitives from `@openbroca/ui`
- do not introduce one-off local button, dialog, card, or input primitives when an existing `packages/ui` component already exists
- keep the layout visually aligned with the desktop app rather than building a marketing-style splash screen

Suggested page structure:

- app title and short explanation
- two permission cards
- per-card status badge
- per-card primary action
- shared refresh action
- a clear footer action row for `Refresh` and `Quit`
- inline guidance for manual system-settings steps

Suggested component families from `packages/ui`:

- `Card`
- `Button`
- `Badge`
- `Alert`
- `Separator`
- `DialogFooter`-style action grouping if a footer container is needed

UI rules:

- `Microphone` card action should request permission when the state is `missing`
- `Desktop Control` card action should open the relevant macOS settings path and then instruct the user to refresh
- the page should show `Granted` vs `Not granted` clearly
- onboarding does not need a manual `Continue` button in v1
- once all required permissions pass, the main process should auto-advance to the main window and close onboarding

## Architecture

### 1. Main-process permission gate

Add a small permission-gate service layer in the desktop main process.

Suggested files:

- [`apps/desktop/src/main/permission-gate/types.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/permission-gate/types.ts)
- [`apps/desktop/src/main/permission-gate/service.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/permission-gate/service.ts)
- [`apps/desktop/src/main/permission-gate/macos.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/permission-gate/macos.ts)

Responsibilities:

- decide whether the current platform needs permission gating
- resolve the normalized permission snapshot
- expose `canEnterMainWindow`
- perform request or manual-step actions

### 2. Window manager integration

Extend the window layer with a dedicated onboarding window.

Suggested files:

- [`apps/desktop/src/main/windows/permission-onboarding-window.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/windows/permission-onboarding-window.ts)
- [`apps/desktop/src/main/window-manager.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/window-manager.ts)

The window manager should gain:

- `createPermissionOnboarding()`
- `getPermissionOnboarding()`
- `closePermissionOnboarding()`

The goal is to keep window lifecycle management in one place rather than inlining this logic in `index.ts`.

### 3. Renderer onboarding surface

Add a dedicated onboarding route and page for the permission flow.

Suggested files:

- [`apps/desktop/src/renderer/src/router/index.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/renderer/src/router/index.tsx)
- [`apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/renderer/src/pages/onboarding/permissions.tsx)

The renderer page should remain presentation-focused:

- render the permission snapshot
- invoke request and refresh actions
- show loading and error states

It should not decide whether the main window is allowed to exist.

## IPC Contract

Expose a narrow IPC bridge for onboarding.

Suggested calls:

- `permissions:getSnapshot`
- `permissions:requestMicrophone`
- `permissions:openDesktopControlSettings`
- `permissions:refresh`
- `permissions:quitApp`

Chosen transition behavior:

- after any request or refresh action, the main process immediately re-checks permissions and, if all are granted, transitions to the main window without waiting for another explicit renderer step

The preload layer should expose these operations through the existing `window.api` pattern rather than adding renderer-side platform code.

## Error Handling

Recoverable cases:

- user dismisses or denies a microphone prompt
- desktop-control trust is still missing after opening system settings
- refresh completes but permissions are still incomplete

Behavior:

- remain in onboarding
- show the latest normalized state
- provide explicit next-step guidance

Non-recoverable cases:

- permission-gate service throws unexpectedly
- onboarding window fails to create
- Electron permission APIs are unavailable in the current environment

Behavior:

- log the failure in the main process
- show a minimal blocking error state if possible
- allow the user to quit cleanly

## Testing

Main-process tests should cover:

- Windows bypasses permission onboarding entirely
- macOS with all permissions granted creates the main window
- macOS with any required permission missing creates onboarding only
- microphone media-access statuses map to the expected normalized states
- desktop-control trust maps to the expected normalized states
- a successful refresh path closes onboarding and opens the main window

Renderer tests should cover:

- two required permission cards render with correct labels and status states
- actions call the right IPC bridge methods
- blocked state keeps the user on onboarding and exposes `Refresh` / `Quit`
- granted state renders the ready-to-continue UI without crashing
- error and loading states are visible and readable

UI tests should prefer the app-local desktop test setup and use the real `@openbroca/ui` surface in mocks where practical, to stay aligned with the repo's shadcn conventions.

## Risks And Non-Goals

Known implementation risks:

- microphone permission changes made in macOS System Settings may not reflect immediately without relaunch, so the onboarding copy and test strategy must account for that
- the current desktop-control path may still have packaging or entitlement prerequisites outside the onboarding UI itself; those should be handled as implementation constraints rather than turned into extra permission cards without a reliable check

Non-goals for the first version:

- adding camera to the required-permission list
- supporting Windows onboarding parity
- introducing a generalized multi-step welcome flow
- redesigning the desktop shell or sidebar
- handling runtime permission revocation while the main window is already open
