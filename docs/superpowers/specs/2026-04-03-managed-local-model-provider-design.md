# Managed Local Model Provider Design

**Date:** 2026-04-03

## Goal

Extend the provider platform so local-model providers can reach a production-usable state instead of stopping at "save a path". The immediate product driver is `sherpa-onnx`, which currently treats connect as a single directory input even though real setup requires:

- choosing a managed model library directory
- downloading built-in models
- importing custom local models
- selecting the current model explicitly

The platform goal is broader than `sherpa-onnx` alone. The system should gain a reusable contract for managed local-model providers so future local ASR providers can plug into the same lifecycle without re-inventing connection UI, runtime gating, or model state handling.

## Current State

The current implementation has three mismatches between the descriptor, runtime, and product flow.

### 1. Connection Is Treated As Static Configuration

`sherpa-onnx` is exposed as a `local` provider with a single `modelDir` field. The renderer saves that path and treats the provider as connected once the config is persisted.

That is not an honest representation of provider readiness. A saved directory does not guarantee that:

- any model exists in the directory
- the model directory structure is valid
- a specific model has been chosen for inference

### 2. Runtime Uses Implicit Model Selection

The current provider implementation scans the configured directory and uses the first downloaded model it finds.

This is not stable enough for real usage:

- users cannot control which model is active
- bilingual and language-specific models cannot coexist predictably
- runtime behavior depends on incidental filesystem state

### 3. Platform Capabilities Are Too Narrow

`LocalASRProvider` currently exposes:

- `listModels()`
- `downloadModel()`
- `deleteModel()`

This is a useful start, but it is still shaped too much around the current `sherpa-onnx` implementation. It does not clearly model:

- the model library directory as a first-class concept
- installable models versus installed models
- importing an external local model into the managed library
- validating a selected model before runtime use

## Decision Summary

The platform will introduce a reusable managed local-model capability for ASR providers.

The design keeps base transcription concerns separate from model lifecycle concerns:

- `ASRProvider` remains responsible for recognition
- managed local-model behavior moves into a dedicated extension interface
- the desktop app uses this capability to drive a richer setup and management flow

The product rules are:

- local-model providers are not considered ready just because a directory was saved
- the provider moves through `unconfigured`, `configured`, and `ready` states
- a provider becomes `ready` only when a model library directory exists, at least one valid managed model exists, and one current model is explicitly selected
- runtime must never guess which local model to use

## Design Principles

### 1. Capability Boundaries Must Stay Honest

Recognition and local model lifecycle are different responsibilities. The platform should not hide model management inside generic connection fields or inside runtime heuristics.

### 2. Persist Facts, Derive Readiness

Persist only durable facts:

- provider connection config such as `modelRootDir`
- the selected model id for that provider

Do not persist redundant readiness flags. Readiness should be derived from persisted state plus current provider validation results.

### 3. Installation Catalog And Installed Inventory Are Different Concepts

Built-in models available for download are not the same thing as models already present in the local library. The platform should represent these as different collections and never collapse them into one ambiguous list.

### 4. Setup And Ongoing Management Have Different Jobs

First-time connection should guide the user through the minimum steps to make the provider usable. Later model maintenance should happen in a management surface that supports adding, switching, and deleting models without pretending the provider is disconnected.

### 5. Runtime Must Refuse Ambiguous Local State

If a selected model is missing or invalid, runtime should fail fast with a configuration error instead of silently falling back to another model.

## Platform Design

### Base ASR Contract

The existing base contract remains unchanged in responsibility:

- `ASRProvider` handles recognition
- `StreamingASRProvider` handles optional realtime transcription

The managed local-model lifecycle is not folded into those interfaces.

### Managed Local Model Extension

Introduce a dedicated extension interface for local-model providers that OpenBroca manages directly.

Recommended shape:

```ts
interface ManagedLocalASRProvider extends ASRProvider {
  getModelStore(): Promise<LocalModelStoreState>
  listManagedModels(): Promise<ManagedModel[]>
  listInstallableModels(): Promise<InstallableModel[]>
  downloadManagedModel(
    modelId: string,
    signal?: AbortSignal
  ): AsyncIterable<ModelTransferProgress>
  importManagedModel(
    input: LocalModelImportInput,
    signal?: AbortSignal
  ): AsyncIterable<ModelTransferProgress>
  deleteManagedModel(modelId: string): Promise<void>
  validateManagedModel(modelId: string): Promise<ManagedModelValidation>
}
```

This interface is intentionally limited to capabilities already justified by the current product need:

- inspect model library state
- enumerate installed models
- enumerate built-in installable models
- download a built-in model
- import a local model into the managed library
- delete a managed model
- validate a candidate model before runtime use

This design explicitly does not introduce:

- remote model search
- arbitrary URL installation
- version upgrade orchestration
- background sync semantics

### Model Store State

The provider must surface model library state explicitly.

Recommended shape:

```ts
interface LocalModelStoreState {
  rootDir?: string
  status: 'unconfigured' | 'configured' | 'ready'
  selectedModelId?: string
  message?: string
}
```

Semantics:

- `unconfigured`: no model library directory has been saved
- `configured`: a model library directory exists, but no valid selected model is currently usable
- `ready`: a valid selected model exists and can be used for recognition

`status` is derived from the provider's current view of disk state and persisted selection, not from a stored flag.

### Installed Model Representation

Installed models need more product-level information than the current `LocalModelInfo`.

Recommended shape:

```ts
interface ManagedModel {
  id: string
  name: string
  source: 'built-in' | 'imported'
  path: string
  installedAt?: string
  sizeBytes?: number
  status: 'ready' | 'invalid'
  validationMessage?: string
}
```

This keeps model inventory understandable in UI and keeps provider-specific validation inside the provider implementation.

### Installable Model Representation

Built-in downloadable models should be separate from installed inventory.

Recommended shape:

```ts
interface InstallableModel {
  id: string
  name: string
  description?: string
  sizeBytes?: number
}
```

These models describe what can be added to the library, not what is currently usable.

### Import And Transfer Progress

Import and download both represent model transfer into the managed library. They should share one progress event shape.

Recommended shape:

```ts
interface ModelTransferProgress {
  modelId: string
  progress: number
  transferredBytes: number
  totalBytes: number
}

interface LocalModelImportInput {
  sourceDir: string
  suggestedName?: string
}
```

The provider remains responsible for mapping import input into a valid managed model directory layout.

### Model Validation Result

Validation should return a structured result rather than forcing the renderer to infer validity from thrown errors.

Recommended shape:

```ts
interface ManagedModelValidation {
  status: 'ready' | 'invalid'
  message?: string
}
```

This keeps provider-specific filesystem checks inside provider code while giving the desktop app enough information to explain why a model cannot be selected.

### Descriptor Metadata

The renderer needs a clean way to discover whether a provider supports the managed local-model flow.

Recommended descriptor extension:

```ts
capabilities: {
  nonStreaming: true,
  streaming?: boolean,
  managedLocalModels?: true
}
```

This keeps the product flow capability-driven rather than provider-id-driven.

## Desktop Data Model

### Persisted State

The existing provider settings structure remains the source of truth for connection-level facts.

Persist:

- `providers[providerId].config.modelRootDir`
- `providerModels[providerId].model`

For `sherpa-onnx`, this design intentionally renames the current config meaning from "current model directory" to "managed model library root". The implementation should migrate existing `modelDir` usage to `modelRootDir` so the persisted name matches the new semantics.

Keep `providerModels` as the shared location for selected model ids across LLM providers and managed local ASR providers. The meaning stays consistent: it stores the explicitly chosen model for a provider.

Do not persist:

- installed model inventory
- built-in installable model catalog
- readiness flags
- validation results

Those values are runtime-derived and should be queried from the main process.

### Derived State

Readiness should be derived from:

- persisted provider config
- persisted selected model id
- provider-side filesystem scan and validation

This avoids stale renderer-side truth and keeps the main process authoritative for local disk state.

## Desktop APIs

The desktop app should stop overloading one generic `listModels` endpoint for unrelated provider families.

Recommended tRPC additions:

- `providers.listLLMModels`
- `providers.getLocalModelStore`
- `providers.listLocalManagedModels`
- `providers.listLocalInstallableModels`
- `providers.downloadLocalModel`
- `providers.importLocalModel`
- `providers.deleteLocalModel`

The naming should reflect the domain. LLM model listing and managed local-model inventory are different product concepts and should not share one ambiguous route.

Download and import actions should stay main-process owned because they interact with local disk and long-running transfers.

## Product Flow

### First-Time Setup

Providers with `managedLocalModels` capability use a setup wizard instead of the current generic manual connection form.

Recommended flow:

1. Choose model library directory
2. Add models
3. Choose current model
4. Finish setup

Step semantics:

- Step 1 persists the connection-level config and moves the provider to `configured`
- Step 2 allows both built-in download and local import into the managed library
- Step 3 requires explicit current-model selection from `ready` managed models
- Step 4 completes only when the provider is `ready`

This flow turns "Connect" into "complete the minimum viable setup for this provider" instead of "save one string field".

### Ongoing Model Management

After setup, the provider exposes a model management surface rather than forcing reconnect semantics for every change.

The management dialog supports:

- viewing the model library directory
- viewing the current selected model
- downloading more built-in models
- importing additional local models
- switching the current model
- deleting non-selected models

This surface is separate from first-time setup because maintenance and initial activation have different UX constraints.

## Provider Row UX

The provider row must reflect readiness instead of only connection persistence.

### `unconfigured`

- Primary action: `Connect`
- Description: no model library configured

### `configured`

- Primary action: `Finish setup`
- Secondary action: `Manage models`
- Description: model library configured, but no ready selected model

### `ready`

- Primary action: `Disconnect`
- Secondary action: `Manage models`
- Description: show current selected model

This makes the product honest about why a provider cannot yet be activated.

## Activation Rules

Only `ready` managed local-model providers may be set as the active ASR provider.

Additional rules:

- if the selected model becomes missing or invalid, the provider falls back from `ready` to `configured`
- if an active ASR provider falls back from `ready` to `configured`, `activeProviders.asr` must be cleared
- runtime never substitutes another installed model automatically

This keeps renderer readiness, persisted selection, and runtime behavior aligned.

## Runtime Behavior

Managed local-model runtime resolution must stop using implicit first-found model selection.

When resolving a managed local-model provider for recognition, runtime must require:

- provider connection enabled
- `modelRootDir` present
- selected model id present
- selected model validates successfully as a `ready` managed model

If any requirement is missing, throw a targeted `ConfigurationError` rather than guessing.

Recommended runtime failures:

- `No model library configured`
- `No current model selected`
- `Selected model is missing or invalid`

All fallback behavior belongs in setup UX, not in inference execution.

## Error Handling

The system should distinguish four user-meaningful failure classes:

- `store-not-configured`
- `model-not-found`
- `model-invalid`
- `transfer-failed`

Rules:

- setup-step errors remain local to the current step and do not wipe persisted config
- failure while downloading or importing a new model must not degrade an already `ready` provider
- deleting or invalidating the current model is what transitions a `ready` provider back to `configured`

The renderer should surface these errors with action-oriented copy instead of collapsing them into one generic "Unable to load models" message.

## Sherpa-ONNX Adaptation

`sherpa-onnx` becomes the first implementation of the managed local-model capability.

Specific behavioral changes:

- replace the current "first downloaded model wins" runtime with explicit selected-model loading
- treat the configured directory as a managed model library root, not as the current model itself
- expose the existing built-in catalog as installable models
- support importing an external sherpa-onnx model directory by copying it into the managed library
- validate the imported or downloaded directory structure in provider code before it becomes selectable

This keeps sherpa-onnx close to real product usage while establishing a reusable platform seam for future local ASR providers.

## Testing

Testing should cover four layers.

### 1. Provider Package

`packages/providers` should cover:

- listing managed models
- listing installable models
- downloading a built-in model
- importing a local model
- deleting a managed model
- validating a selected model
- recognition failure when the selected model is missing or invalid

### 2. Desktop Main Process

`apps/desktop/src/main` should cover:

- exposing managed local-model metadata through tRPC
- runtime rejection when store config is incomplete
- runtime rejection when the selected model is missing or invalid
- clearing active ASR state when readiness is lost

### 3. Desktop Renderer

`apps/desktop/src/renderer` should cover:

- managed local providers using setup wizard flow instead of generic local form flow
- `configured` rows showing `Finish setup`
- `ready` rows showing the selected model and management actions
- current-model deletion causing readiness and activation UI to update correctly

### 4. Store Normalization

Shared provider settings tests should cover:

- backward-safe normalization of persisted settings
- coexistence of LLM and managed local ASR selections inside `providerModels`
- correct cleanup when a managed local provider is disconnected or loses readiness

## Out Of Scope

This design does not include:

- remote model search
- arbitrary URL downloads
- upgrade orchestration for installed models
- concurrent prewarming of multiple local models
- renderer-persisted cache of model inventory

These can be considered later if real product demand appears. They are not required to make managed local-model providers practical, extensible, and maintainable now.
