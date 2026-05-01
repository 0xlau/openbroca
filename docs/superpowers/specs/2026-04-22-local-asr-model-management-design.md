# Local ASR Model Management Design

**Date:** 2026-04-22 (revised)

## Goal

Introduce a shared local-model management flow for all desktop local ASR providers so users can:

- connect a local ASR provider by downloading a model from the catalog in one step
- finish connect only when a usable model is installed and selected
- switch or download additional models later from settings without leaving the providers page
- reuse the same lifecycle and UX rules across providers instead of building a sherpa-only flow

The first concrete implementation will be `@k2-fsa/sherpa-onnx`, but the design target is the local ASR platform, not a single provider.

## Product Decisions

The following decisions are fixed by this design:

- a local ASR provider may have multiple installed models, but runtime uses exactly one `selectedModelId`
- `Connect` is a single flow: pick a catalog model, download it, done — no directory picker on the primary path
- the model storage directory is app-managed by default (`<userData>/asr-models/<providerId>`); advanced users can override it later from settings
- the connect dialog highlights a recommended model based on the app's UI language
- switching to an uninstalled model from settings enters the same install flow and automatically selects it after install completes
- a local ASR provider can only be activated when it has a valid directory, a selected model, and that selected model is installed and ready
- importing an already-installed model directory from a custom path is a future Advanced feature, not part of v1

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

Local ASR connection data remains part of the existing provider connection record. `modelDir` lives in `config`, but for the typical user it is set by the app (not entered in the UI):

```ts
providers: {
  'sherpa-onnx': {
    enabled: true,
    connectionType: 'local',
    config: {
      modelDir: '<userData>/asr-models/sherpa-onnx'
    }
  }
}
```

`modelDir` is provided by the descriptor as a default at construction time (see *Descriptor Construction*). The connect dialog does not surface this field. Advanced users can override it later from settings.

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

Each local ASR provider exposes a shared lifecycle. The provider holds `modelDir` as construction state — methods do not take it as an argument. Registry-level cache eviction (already in place) recreates the provider when `modelDir` changes, so each instance always sees a single consistent directory.

```ts
interface LocalASRProvider extends ASRProvider {
  listCatalogModels(): Promise<LocalCatalogModel[]>
  scanInstalledModels(): Promise<InstalledLocalModel[]>
  installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent>
  removeInstalledModel(modelId: string): Promise<void>
  resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime>
}
```

1. `listCatalogModels()` — provider-defined downloadable catalog. Each entry carries enough metadata for the UI (name, size, optional `recommendedFor` language tags) and for safe download (`downloadUrl`, `sha256`).
2. `scanInstalledModels()` — scans the held `modelDir` and returns models already installed and usable.
3. `installModel(modelId, signal?)` — full install: download → extract → validate → atomically publish. Yields phase-tagged events (see *Install Event Stream*).
4. `removeInstalledModel(modelId)` — deletes the model's installed assets from `modelDir`.
5. `resolveModelRuntime(selectedModelId)` — returns the runtime metadata required to load that model. Throws `ConfigurationError` if not installed.

### Install Semantics

`installModel()` has a strict meaning:

- download all required assets, **streamed directly to disk** (no full-archive buffering in memory)
- verify the archive against the catalog's `sha256` before extracting
- extract or arrange the assets into the provider's final directory layout
- validate that required files are present
- atomically publish the final installed directory (write to a `*.staging` path then `rename`)
- clean up partial state — staging dir, temp archive — on failure or cancellation

A provider must not report install success if only a temporary archive exists, or if the staged directory does not validate.

### Install Event Stream

`installModel()` yields a discriminated union so the UI can render each phase honestly. Only `downloading` carries percentage progress; the remaining phases are short and fire once each.

```ts
type LocalModelInstallEvent =
  | { phase: 'downloading'; downloadedBytes: number; totalBytes: number }
  | { phase: 'extracting' }
  | { phase: 'validating' }
  | { phase: 'finalizing' }
```

UI rendering: `downloading` → progress bar with bytes; the other three → indeterminate spinner with phase label.

### Catalog Entry

Each catalog model exposes the fields the UI and installer both need:

```ts
interface LocalCatalogModel {
  id: string
  name: string
  description?: string
  sizeBytes: number
  downloadUrl: string
  sha256: string
  /** ISO language tags this model is intended for; UI uses these to highlight a recommended default. */
  recommendedFor?: string[]
}
```

`sha256` is mandatory in v1 — supply chain integrity is cheap to add now and hard to retrofit later.

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

- `modelDir` is set (always true after connect — defaulted by the descriptor)
- `selectedModelId` is set
- that selected model is installed and ready

### Connect Flow (single path)

`Connect` is a single download flow with no directory picker:

1. open the connect dialog → render the catalog
2. highlight the entry whose `recommendedFor` contains `app.getLocale()`; otherwise highlight the first
3. user picks one and clicks Download
4. install it into the descriptor-provided default `modelDir`
5. on completion: write `config.modelDir` (= the default), `settings.selectedModelId`, `enabled: true`
6. close the dialog — provider is ready

There is intentionally no "use existing directory" branch on the primary path. Power users who already have local model directories use the *Advanced* settings path described below.

### Settings Capabilities

Settings is the post-connect model-management surface and supports:

- viewing the current directory (read-only by default; editable under Advanced)
- viewing installed models with size and "active" indicator
- switching to another installed model
- viewing catalog models that are not yet installed
- installing an uninstalled model and automatically selecting it
- deleting an installed non-active model

Under an *Advanced* disclosure:

- changing the model directory and rescanning it (covers the "import existing directory" use case from earlier drafts)

If the current selected model is removed or disappears after a directory change, `selectedModelId` must be cleared and setup status must drop out of `ready`.

## Main Process Responsibilities

The desktop main process owns orchestration. Provider implementations own the underlying provider-specific work.

### Main Process API

The desktop app exposes a dedicated local-model tRPC layer:

- `providers.localModels.getState(providerId)` — current `modelDir`, `selectedModelId`, catalog list, installed list
- `providers.localModels.install(providerId, modelId)` — subscription returning `LocalModelInstallEvent`s; on completion the main process writes `selectedModelId` and `enabled: true`
- `providers.localModels.cancelInstall(providerId)` — abort the in-flight install for that provider
- `providers.localModels.select(providerId, modelId)` — pick an already-installed model as active
- `providers.localModels.remove(providerId, modelId)` — delete an installed model
- `providers.localModels.changeDirectory(providerId, modelDir)` — Advanced; updates `config.modelDir`, evicts cached provider, re-scans

These APIs are the only way the renderer changes local-model state. They write persistence on success.

### In-Flight Install Tracking

Install is long-running but does not need a separate task state machine in v1. The main process holds at most one in-flight `AsyncIterator` per `providerId`, plus its `AbortController`. The trpc subscription consumes that iterator directly.

Concurrency rules:

- only one install may run per `providerId` at a time
- a second `install()` for the same `providerId + modelId` while one is running attaches to the existing iterator (via a fan-out adapter or by reading from a snapshot of the latest event) — it does not start a duplicate
- a second `install()` for a different `modelId` while one is running rejects with a clear "another install is in progress" error rather than queueing

A full task model with `idle/succeeded/failed/cancelled` history can be added later if a multi-pane UI requires it; v1 doesn't need it.

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

The ASR registry caches provider instances by `(providerId, configHash)`. When `modelDir` (which lives in `config`) changes, the registry already disposes the old instance and creates a fresh one on the next `resolve()` — this is built into the registry as of the recent refactor and is the reason the provider can hold `modelDir` as construction state.

`selectedModelId` lives in `providerSettings`, not `config`, so it does **not** trigger registry eviction. The runtime layer reads `selectedModelId` from settings on each resolve and passes it to `resolveModelRuntime(selectedModelId)`. Switching the active model is a settings write — no provider rebuild required.

## Descriptor Construction

Local ASR descriptors need access to the platform-managed default directory, which is only known in the main process (`app.getPath('userData')`). The descriptor is therefore exposed as a factory rather than a static export:

```ts
// packages/providers/src/asr/providers/sherpa-onnx/index.ts
export function createSherpaOnnxDescriptor(opts: {
  defaultModelDir: string
}): ASRProviderDescriptor<SherpaOnnxConfig, SherpaOnnxSettings>
```

Bootstrap (in desktop main):

```ts
const descriptor = createSherpaOnnxDescriptor({
  defaultModelDir: path.join(app.getPath('userData'), 'asr-models', 'sherpa-onnx')
})
asrRegistry.register(descriptor)
```

The descriptor:

- sets `defaultValue` for `modelDir` in the `local` connection option, so when the user activates Connect the dialog already has a valid directory and does not need to render the field
- applies the default in the Zod schema via `.default(opts.defaultModelDir)` so persisted records that omit `modelDir` resolve correctly

## Sherpa-ONNX First Implementation

`sherpa-onnx` is the first provider to implement this platform contract.

### Required Behavioral Changes

The sherpa implementation must:

- expose a provider-defined downloadable catalog with `sha256` per entry
- scan its held `modelDir` for installed sherpa models
- install a chosen model all the way to a usable final directory:
  - stream the archive to disk via `https.get(url).pipe(fs.createWriteStream(tmpPath))` — no `Buffer.concat` of the full payload
  - verify `sha256` before extracting
  - extract to a `*.staging` directory, validate required files (architecture-specific: encoder/decoder/joiner/tokens for transducer; encoder/decoder/tokens for paraformer), then atomically `rename` to the final path
  - delete the archive on success; remove staging + archive on failure or cancel
- emit phase-tagged `LocalModelInstallEvent`s
- resolve runtime strictly from `selectedModelId`; throw `ConfigurationError` if not installed
- stop picking the first model found in `modelDir`

### Default Directory

```txt
<userData>/asr-models/sherpa-onnx
```

The user does not see this during connect. They can override it under Advanced settings if they want models stored elsewhere.

### Settings UX

For sherpa specifically, settings shows:

- current selected model (with size, language hint)
- installed model list with "use" / "remove" actions
- catalog model list (filtered to entries not yet installed) with "download and use" action
- under an *Advanced* disclosure: the current `modelDir` and a "Change directory" action that triggers a rescan after path change

Clicking an uninstalled catalog model triggers install and automatically switches `selectedModelId` after completion.

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
- a queue of multiple simultaneous install tasks for one provider
- a provider-agnostic filesystem layout guessed by the platform
- broad refactoring of cloud ASR providers
- importing a pre-existing model directory from outside the managed `modelDir` (a future Advanced feature; v1 covers the same need by letting users change `modelDir` to point at their existing folder and rescanning)
- resumable / partial-content downloads (catalog models are tens to a few hundred MB; restart-on-failure is acceptable for v1)

## Recommended Implementation Order

1. extend the local ASR platform contract (no `modelDir` in method signatures), `LocalCatalogModel` with `sha256`, install event union, persistence semantics for `selectedModelId`
2. convert the sherpa descriptor to a `createSherpaOnnxDescriptor({ defaultModelDir })` factory; rewrite the sherpa provider to hold `modelDir` and implement the new lifecycle (streamed download, sha256 verify, staging + atomic rename, validate, strict selected-model runtime)
3. add main-process `providers.localModels.*` tRPC APIs and the in-flight install holder
4. wire setup status and activation gating to require an installed selected model
5. implement the single-path connect dialog (catalog + recommended highlight + download progress)
6. implement settings: switch active model, download additional, remove, plus Advanced directory change
7. finish migration handling and regression coverage

## Risks

- Streaming download must clean up the on-disk temp file on cancel/error; otherwise repeated failed installs accumulate dead bytes under `userData`.
- The `recommendedFor` highlight depends on `app.getLocale()` returning a useful tag; fall back to the first catalog entry if the locale doesn't match anything.
- `tar -xjf` is available on macOS and most Linux distros but not always on Windows; before shipping Windows builds, swap to a node tar/bz2 lib.
- Different local ASR providers may use different final model layouts, so the platform must not guess provider-specific file conventions — validation lives in the provider.
- Reusing the old generic `model` field for local ASR would blur LLM and local-model semantics; we keep `selectedModelId` separate.
