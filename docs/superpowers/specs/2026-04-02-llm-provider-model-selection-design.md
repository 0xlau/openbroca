# LLM Provider Model Selection Design

**Date:** 2026-04-02

## Goal

Add explicit LLM model selection to the desktop providers page so a connected LLM provider is not considered fully usable until it also has a configured model.

The immediate product goals are:

- connected LLM providers expose a `settings` action for model configuration
- users can configure a saved model per connected LLM provider before activation
- `Set as active` remains a separate explicit action
- an LLM provider only becomes truly active when both provider and model are selected

The engineering goal is to make renderer state, persisted settings, and main-process runtime selection all describe the same provider-plus-model activation contract.

## Scope

This design covers desktop LLM model selection only:

- provider-row settings UI for connected LLM providers
- persisted model selection state
- active LLM activation rules
- runtime consumption of the active LLM model
- tests needed to keep the behavior stable

This design does not include:

- ASR model selection
- automatic activation when a model is saved
- fallback to the first model returned by a provider
- free-form switching between dropdown mode and manual mode per provider
- redesigning the providers page layout

## Current State

The current providers page already supports:

- connecting and disconnecting providers
- persisting connection records in `providers`
- persisting the active provider id in `activeProviders`
- resolving LLM model lists through `trpc.providers.listModels`

The current gaps are:

- connected LLM providers have no place to choose a model
- `Set as active` only persists `activeProviders.llm`
- runtime selection still falls back to `selectFirstLLMModel()`
- the app cannot express the product rule that an LLM provider is only truly active when it also has an active model

This creates a mismatch between the UI and runtime:

- the page suggests provider activation is sufficient
- the pipeline still chooses the first model implicitly
- users cannot see or control which model will actually run

## Decision Summary

The desktop app will treat active LLM configuration as a two-step process:

1. configure a saved model for a connected LLM provider through a `settings` action
2. explicitly click `Set as active` to copy that provider and its saved model into the active runtime selection

The design introduces two related but separate layers of model state:

- provider-level saved model selection
- active runtime LLM model selection

This mirrors the existing separation between connection state and activation state:

- connection answers whether a provider can be used
- provider-level model selection answers which model that provider is prepared to use
- activation answers which provider and model the real pipeline is using right now

## Why This Shape

This design matches the intended user flow:

- users may connect several LLM providers
- users may preconfigure different models for those providers
- choosing a model does not unexpectedly switch the active runtime provider
- activation remains a deliberate final action

Compared with auto-activating on save, this is better because:

- it preserves the existing mental model of `Set as active`
- it avoids surprising provider switches while users are still editing settings
- it allows multiple connected providers to be prepared in advance

Compared with only storing a temporary model at activation time, this is better because:

- the settings icon has a meaningful persistent outcome
- users do not need to re-enter or re-select a model every time they switch providers
- the row UI can show what model is already prepared for each provider

## Data Model

### Persisted Settings

`ProviderSettings` will grow a second activation field and a provider-level LLM model configuration map.

Recommended shape:

```ts
type ActiveProviders = {
  llm?: string
  asr?: string
}

type ActiveModels = {
  llm?: string
}

type ProviderModelSelection = {
  model: string
}

type ProviderSettings = {
  providers: Record<string, ProviderConnectionRecord | undefined>
  providerModels: Record<string, ProviderModelSelection | undefined>
  activeProviders: ActiveProviders
  activeModels: ActiveModels
}
```

This keeps connection records focused on connection concerns instead of mixing connection and model settings into one object.

### Semantics

The fields have different responsibilities:

- `providers[providerId]` stores connection metadata only
- `providerModels[providerId]` stores the saved model for that provider
- `activeProviders.llm` stores the active LLM provider id
- `activeModels.llm` stores the model currently used by the LLM pipeline

This separation is intentional. A saved provider model does not automatically become active.

### Defaults and Normalization

Default persisted value:

```ts
{
  providers: {},
  providerModels: {},
  activeProviders: {},
  activeModels: {}
}
```

Normalization rules:

- backfill missing `providerModels` and `activeModels` as empty objects
- retain existing `providers` and `activeProviders` behavior
- only keep `activeProviders.llm` when the provider still has a connection record
- only keep `activeModels.llm` when `activeProviders.llm` is still valid
- if the active provider is cleared, also clear `activeModels.llm`

### Activation Write Rules

`Set as active` for an LLM provider writes both values together:

```ts
activeProviders.llm = providerId
activeModels.llm = providerModels[providerId].model
```

This is the moment the provider becomes truly active.

Saving model settings does not write to either active field.

## UI Behavior

### Provider Row

The existing provider row layout stays in place with one LLM-specific extension.

For connected LLM providers:

- show a `settings` icon button using Hugeicons
- keep the existing `Set as active` button
- show the saved model in row copy when one exists

For connected ASR providers:

- no model settings icon is shown
- existing active-provider behavior stays unchanged

### Activation Gating

For connected LLM providers with no saved model:

- disable `Set as active`
- show helper copy such as `Choose a model first`

For connected LLM providers with a saved model:

- enable `Set as active`
- show row copy such as `Saved model: gpt-4.1`

For the active LLM provider:

- show `Current` in place of `Set as active`
- show `Active model: <model>`
- if the saved model differs from the active model, also show `Saved model: <model>` so the pending change is visible without auto-applying it

### Settings Dialog

A new `ProviderModelSettingsDialog` will handle model configuration for one LLM provider at a time.

Responsibilities:

- open from the provider-row `settings` icon
- render the correct model input mode for the selected provider
- save provider-level model selection only
- never activate the provider automatically

`ProviderConnectDialog` continues to own connection setup only.

### Input Modes

Model input mode is determined by provider-specific rules, not by runtime availability.

Two supported modes:

- dropdown selection for providers on the explicit dropdown whitelist
- manual text input for providers on the explicit manual-entry whitelist

Initial product rule from this design session:

- `openai` and `openai-codex` use dropdown mode
- any future custom or self-hosted LLM provider uses manual-entry mode unless it is explicitly added to the dropdown whitelist

The implementation should centralize this decision in one small helper so the UI does not scatter provider-id checks across multiple files.

### Dropdown Providers

For dropdown providers:

- fetch models with `trpc.providers.listModels({ providerId })` when the dialog opens
- render a required select control
- persist the selected model id as the saved model

### Manual Providers

For manual providers:

- render a required text input
- trim whitespace before save
- persist the entered model name as the saved model

## Data Flow

The intended flow is:

1. user connects an LLM provider
2. the row shows a `settings` icon
3. user opens settings and saves a provider-level model
4. the row now shows the saved model and enables `Set as active`
5. user clicks `Set as active`
6. the app writes both `activeProviders.llm` and `activeModels.llm`
7. runtime uses that exact provider and model for the post-recording pipeline

This preserves a clear distinction between preparation and activation.

## Runtime Behavior

### Main Process Selection

The main process should stop choosing the first model implicitly.

Instead, runtime code should:

- resolve the active LLM provider as it does today
- read `activeModels.llm`
- require that the active model is present before generating

Recommended helper behavior:

```ts
getActiveLLMModel(store): string | undefined
```

Recommended failure behavior:

- if no active LLM provider exists, keep the current provider-not-configured error
- if an active provider exists but no active model exists, throw a configuration error that clearly instructs the user to choose a model

Suggested message:

- `Select an active LLM provider and model before requesting runtime access.`

### Pipeline Integration

`PostRecordingPipeline` should no longer default to `selectFirstLLMModel`.

Instead, it should use the saved active model directly when building the completion request:

```ts
llmRequest = {
  model: activeModel,
  messages: [...]
}
```

This makes the debug history and the actual runtime behavior reflect the same user choice.

## Disconnect and Update Rules

### Disconnect

If a disconnected provider is currently active for LLM:

- clear `activeProviders.llm`
- clear `activeModels.llm`
- remove its saved provider model if the provider connection record is removed

If a disconnected provider is not active:

- remove its connection record
- remove its saved provider model
- do not affect other active selections

### Updating the Saved Model

If a user updates the saved model for a non-active provider:

- only update `providerModels[providerId]`

If a user updates the saved model for the current active provider:

- only update `providerModels[providerId]`
- do not change `activeModels.llm`
- require the user to click `Set as active` again to promote the new saved model into the active runtime selection

This preserves the explicit activation rule.

## Error Handling

The UI should surface model-configuration failures inside the settings dialog without mutating active state.

Required cases:

- dropdown provider model fetch fails:
  - show an inline loading failure message
  - disable save until a valid model is available
- dropdown provider returns no models:
  - show `No models available for this provider`
  - disable save
- manual provider input is empty after trimming:
  - disable save
- active provider is disconnected:
  - clear active provider and active model together

No failure in the settings dialog should silently switch the active provider or active model.

## Testing

### Renderer Page Tests

Add coverage for:

- connected LLM providers show the settings icon
- connected ASR providers do not show the settings icon
- `Set as active` is disabled for connected LLM providers with no saved model
- dropdown-mode providers fetch models and save the selected one
- manual-entry providers save the typed model name
- activating a provider writes both `activeProviders.llm` and `activeModels.llm`
- changing the saved model for the current active provider does not automatically change `activeModels.llm`
- row copy distinguishes active model from saved model when they differ

### Store and Shared-State Tests

Add coverage for:

- default and normalized `providerModels` and `activeModels`
- nested update behavior when provider model settings change
- cleanup behavior when a provider is disconnected
- cleanup behavior when an active LLM provider is removed

### Main Process Tests

Add coverage for:

- reading the active LLM model from persisted settings
- throwing a configuration error when an active provider exists without an active model
- using the stored active model in `PostRecordingPipeline`
- no longer falling back to the first model returned by `listModels()`

## Implementation Notes

Keep the implementation incremental:

- extend shared settings types first
- update store normalization and cleanup helpers next
- add the LLM settings dialog and provider-row controls after the state shape is stable
- switch runtime code from first-model fallback to active-model lookup only after persisted state is available

This reduces the chance that the UI and runtime diverge during the transition.
