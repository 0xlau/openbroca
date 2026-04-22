# Local ASR Model Management Design

**Date:** 2026-04-22

## Goal

Introduce a shared local-model management flow for all desktop local ASR providers so users can:

- connect a local ASR provider by either downloading a model or pointing at an existing directory
- finish connect only when a usable model is installed and selected
- switch models later from settings without leaving the providers page
- reuse the same lifecycle and UX rules across providers instead of building a sherpa-only flow

The first concrete implementation will be `@k2-fsa/sherpa-onnx`, but the design target is the local ASR platform, not a single provider.

## Product Decisions

The following decisions were confirmed during brainstorming and are fixed by this design:

- a local ASR provider may have multiple installed models, but runtime uses exactly one `selectedModelId`
- `Connect` defaults to a `Download model` path, while `Use existing directory` remains available as a secondary path
- connect can suggest a default model directory, but the user may override it during connect or later in settings
- switching to an uninstalled model from settings should enter the same install flow and automatically select it after install completes
- a local ASR provider can only be activated when it has a valid directory, a selected model, and that selected model is installed and ready
- the local ASR platform must support both provider-defined model catalogs and importing already-installed models from an existing directory

## Current State

The current provider platform already distinguishes:

- provider connection data stored under `providers`
- provider-specific settings stored under `providerSettings`
- active provider ids stored under `activeProviders`

For local ASR specifically, the current state is incomplete:

- `LocalASRProvider` exposes `listModels()`, `downloadModel()`, and `deleteModel()`
- the current sherpa descriptor only asks for a `modelDir`
- connect only writes the directory path and does not require a selected or installed model
- setup status for local ASR falls back to a generic ready state when the descriptor does not provide `getSetupStatus()`
- runtime resolves sherpa from `modelDir` and then picks the first installed model it can find
- sherpa `downloadModel()` writes a temporary archive file but does not finish installation into a usable model directory

This means the current UI can make a local ASR provider look connected while runtime is still unable to transcribe.

## Decision Summary

Local ASR model management will be added as a provider-owned platform capability on top of the existing ASR provider architecture.

The desktop app will keep the existing separation of concerns:

- `providers[providerId].config` stores connection data such as `modelDir`
- `providerSettings[providerId]` stores the current `selectedModelId`
- runtime consumes only `modelDir + selectedModelId`
- provider implementations own catalog, scan, install, delete, and runtime resolution behavior
- the desktop main process owns task orchestration, progress reporting, persistence writes, and instance invalidation

This is intentionally not a sherpa-specific feature and intentionally not a desktop-only model service detached from providers.

## Data Model

### Connection State

Local ASR connection data remains part of the existing provider connection record.

Example:

```ts
providers: {
  'sherpa-onnx': {
    enabled: true,
    connectionType: 'local',
    config: {
      modelDir: '/Users/example/Library/Application Support/OpenBroca/models/sherpa-onnx'
    }
  }
}
```

`modelDir` is the current connected directory for that provider.

### Provider Settings

Local ASR model selection is stored under provider settings using a provider-specific key:

```ts
providerSettings: {
  'sherpa-onnx': {
    selectedModelId: 'paraformer-zh'
  }
}
```

This design deliberately does not reuse the existing generic `model` field that is currently used by LLM providers. `selectedModelId` is clearer for local ASR and avoids mixing two different semantics into one field.

### Runtime Truth

The filesystem remains the source of truth for installed local models.

The store must not persist derived data such as:

- the installed model list
- whether a catalog entry is currently downloaded
- file validation state

Those values must be derived by scanning the current directory through provider-owned logic.

## Platform Contract

### Existing Base Rule

The existing `LocalASRProvider` contract is too weak for the desired UX because it conflates "download bytes" and "install a usable model".

This design upgrades local ASR providers to support a full model lifecycle.

### Required Local ASR Capabilities

Each local ASR provider should expose a shared lifecycle with provider-owned implementations:

1. `listCatalogModels()`
Returns the provider-defined downloadable model catalog.

2. `scanInstalledModels(modelDir)`
Scans a target directory and returns the models that are already installed and usable there.

3. `installModel(modelId, modelDir, signal?)`
Installs a model into a usable state. This must include the complete install process, not just downloading an archive.

4. `removeInstalledModel(modelId, modelDir)`
Deletes an installed model from the target directory.

5. `resolveModelRuntime(modelDir, selectedModelId)`
Resolves the exact runtime assets for the selected model.

The platform may choose slightly different final type names, but these responsibilities are mandatory.

### Install Semantics

`installModel()` has a strict meaning:

- download all required assets
- extract or arrange them into the provider's final directory layout
- validate required files
- atomically publish the final installed directory
- clean up partial state on failure or cancellation

A provider must not report install success if only a temporary archive exists.

## Setup Status Contract

Local ASR `getSetupStatus()` must be provider-aware and runtime-aware.

The unified states are:

- `not-connected`
No valid `modelDir` has been connected yet.

- `configured`
The provider has a directory but not yet a ready selected model. This includes in-progress installation.

- `invalid`
The directory is missing, scan failed, the selected model is missing, the selected model is not installed, or the selected model cannot be resolved for runtime.

- `ready`
The provider has a valid directory, a `selectedModelId`, and that model is installed and resolvable.

Activation is allowed only when setup status is `ready`.

## Connect and Settings Flow

### Connect Completion Rule

For local ASR, connect is only complete when:

- `modelDir` is known
- `selectedModelId` is known
- that selected model is installed and ready

Choosing only a directory does not count as a completed connection.

### Connect Primary Path: Download Model

`Connect` defaults to a `Download model` path:

1. show the recommended provider default directory
2. allow the user to accept it or choose a custom directory
3. list catalog models
4. let the user pick one model
5. install it into the chosen directory
6. write `config.modelDir`
7. write `settings.selectedModelId`
8. mark the provider ready

### Connect Secondary Path: Use Existing Directory

`Use existing directory` remains available in the same connect flow:

1. choose a directory
2. scan that directory for installed models
3. if models are found, choose one as `selectedModelId`
4. if no models are found, keep the chosen directory and route the user into the download flow

Both connect paths converge on the same completion state.

### Settings Capabilities

Settings becomes the model-management surface for local ASR and must support:

- viewing the current directory
- changing the directory and rescanning it
- viewing installed models
- switching to another installed model
- viewing catalog models
- installing an uninstalled model and automatically selecting it
- deleting an installed model

If the current selected model is removed or disappears after a directory change, `selectedModelId` must be cleared and setup status must drop out of `ready`.

## Main Process Responsibilities

The desktop main process owns orchestration. Provider implementations own the underlying provider-specific work.

### Main Process API

The desktop app should expose a dedicated local-model API layer for local ASR providers. The API surface should support:

- reading the current local model state for a provider
- installing a model into a target directory
- cancelling an in-flight install
- selecting an installed model
- changing the connected model directory
- removing an installed model

These APIs should be the only way the renderer changes local-model state. They should update persistence on success rather than relying on renderer-side store writes assembled in multiple places.

### Task Model

Model installation is a task, not a one-shot form submission.

Every install task should report:

- `taskId`
- `providerId`
- `modelId`
- `modelDir`
- `status`
- `progress`
- `downloadedBytes`
- `totalBytes`
- `message`

Suggested task states:

- `idle`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Concurrency rule:

- only one install task may run for the same `providerId + modelDir` at a time
- re-requesting the same install should reuse the current task state
- starting a different install while one is running should be blocked until the current task finishes or is cancelled

## Runtime Rules

Runtime must stop using any implicit fallback model selection.

Local ASR runtime resolution must require:

- `modelDir`
- `selectedModelId`

The provider must resolve exactly that selected model. It must not silently fall back to:

- the first installed model in the directory
- another installed model that happens to parse successfully

If `modelDir` or `selectedModelId` is missing, or the selected model is not actually installed, runtime must fail with a clear configuration error instead of guessing.

## Provider Instance Invalidation

The current ASR registry caches provider instances. That is unsafe for local ASR once directory selection and model switching become mutable.

The desktop runtime layer must evict cached local ASR provider instances when either of these changes:

- the provider connection config changes in a way that affects runtime, such as `modelDir`
- provider settings change in a way that affects runtime, such as `selectedModelId`

After eviction, the next resolve call must create a fresh provider instance using the latest persisted state.

## Sherpa-ONNX First Implementation

`sherpa-onnx` will be the first provider to implement this platform contract.

### Required Behavioral Changes

The sherpa implementation must:

- expose a provider-defined downloadable catalog
- scan a chosen directory for installed sherpa models
- install a chosen model all the way to a usable final directory
- resolve runtime strictly from `selectedModelId`
- stop picking the first model found in `modelDir`

### Default Directory

The sherpa connect flow should suggest a default directory under the desktop app support path, such as:

```txt
~/Library/Application Support/OpenBroca/models/sherpa-onnx
```

The user may override it during connect or later in settings.

### Settings UX

For sherpa specifically, settings should show:

- current selected model
- installed model list
- catalog model list
- the connected directory

Clicking an uninstalled catalog model in settings should trigger install and automatically switch `selectedModelId` after completion.

## Migration and Compatibility

This design adds new local ASR behavior without changing the top-level persisted store shape.

Required migration behavior:

- keep `providers`, `providerSettings`, and `activeProviders` as the main persisted object shape
- extend normalization to preserve `selectedModelId` for local ASR providers
- do not break existing LLM `model` storage while introducing local ASR `selectedModelId`

No compatibility layer should preserve the old sherpa behavior of "scan a directory and use whichever model appears first". The old fallback should be removed.

## Testing Strategy

The implementation plan should cover tests at four layers:

1. provider contract tests
Verify the new local ASR lifecycle contract and status semantics.

2. sherpa provider tests
Verify scan, install, delete, selected-model runtime resolution, and failure cleanup.

3. main-process router and runtime tests
Verify task orchestration, persistence writes, setup status, and provider instance eviction.

4. renderer providers page and dialog tests
Verify connect completion rules, settings-based model switching, directory changes, and activation gating.

## Non-Goals

This design does not include:

- arbitrary manual entry of per-file model asset paths
- a queue of multiple simultaneous install tasks for one provider and directory
- a provider-agnostic filesystem layout guessed by the platform
- broad refactoring of cloud ASR providers

## Recommended Implementation Order

1. extend the local ASR platform contract and persistence semantics
2. make sherpa installation real and runtime resolution strict
3. add main-process local-model APIs and install task orchestration
4. wire setup status and activation gating to the new runtime-aware rules
5. implement the connect `Download model` path
6. implement the connect `Use existing directory` path
7. implement settings-based switching, install-and-switch, directory changes, and deletion
8. finish migration handling and regression coverage

## Risks

- ASR provider instance caching can leak stale directory or model selection into runtime if eviction is missed.
- Install tasks touch both network and filesystem, so partial failure cleanup must be explicit.
- Different local ASR providers may use different final model layouts, so the platform must not guess provider-specific file conventions.
- Reusing the old generic `model` field for local ASR would blur LLM and local-model semantics and make future maintenance harder.
