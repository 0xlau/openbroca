# Provider-Defined Settings Design

**Date:** 2026-04-06

## Goal

Unify provider configuration in the desktop app so each provider can declare its own post-connection settings, validation rules, and readiness logic through the shared provider platform instead of relying on renderer-side special cases.

The immediate product goals are:

- connected providers expose one shared `Settings` entry point
- providers define their own settings items such as `model` or Deepgram `language`
- provider rows show real-time readiness derived from provider-defined validation
- `Set as active` only selects which provider a pipeline uses
- editing the active provider's settings affects subsequent runtime calls immediately

The engineering goal is to extend the shared provider descriptor model so settings UI, readiness, persistence, and runtime resolution all follow one provider-driven contract across both LLM and ASR providers.

## Scope

This design covers:

- provider-defined settings metadata in the shared provider contracts
- unified desktop persistence for provider settings
- a shared provider settings dialog in the desktop renderer
- provider-defined readiness and activation gating
- runtime resolution from active provider plus current provider settings
- migration away from LLM-only model settings state
- initial first-cut support for LLM model selection and Deepgram language selection

This design does not include:

- fully custom provider-rendered settings panels
- arbitrary provider-defined React components
- redesigning the overall Providers page layout
- exposing every possible Deepgram option in the first pass
- unsaved draft preview or optimistic row updates before save

## Current State

The repository already has:

- shared provider descriptors for LLM and ASR providers in `packages/providers`
- descriptor-driven connection setup through `connectionOptions`
- a desktop Providers page that can connect providers and set one active provider per capability
- an LLM-only `ProviderModelSettingsDialog`
- persisted renderer and main-process provider state under the `providers` store key

The current gap is that settings after connection are not modeled consistently:

- LLM model selection is a special renderer-only flow
- ASR providers have no comparable settings entry point
- readiness is partly inferred in renderer code instead of being owned by the provider
- runtime selection still reflects an older split between provider-level saved model state and active runtime model state

This creates several mismatches:

- the provider platform already uses descriptors for connection setup but not for post-connection settings
- the renderer knows too much about provider-specific behavior
- model selection is treated as a special subsystem instead of one kind of provider setting
- the product mental model is drifting toward "settings belong to providers" while persisted state still reflects older LLM-specific decisions

## Decision Summary

The desktop app will adopt one provider-defined settings system with these rules:

- each provider descriptor may declare `settingsSchema`, `settingsItems`, and `getSetupStatus()`
- the desktop renderer will use one shared `ProviderSettingsDialog` for all providers with settings
- `providerSettings[providerId]` becomes the single persisted source of truth for provider-defined settings, including `model`
- `providers[providerId]` remains connection-only state
- `activeProviders` remains the only activation state
- `providerModels` and `activeModels` are removed
- runtime resolves the active provider and reads its current `providerSettings` directly
- provider rows render readiness from provider-defined status, not renderer heuristics

## Why This Shape

This design matches the product direction established during the design session:

- model selection should feel like one settings item among others
- Deepgram language should be configured the same way as LLM model choice
- activation should answer only "which provider is active", not "which frozen copy of settings is active"
- providers should own readiness logic instead of forcing the renderer to hardcode business rules

Compared with keeping separate model-specific state, this is better because:

- there is one coherent settings mental model for users
- renderer state becomes simpler
- provider-specific validation stays near provider-specific configuration semantics
- runtime no longer needs to reconcile a saved model layer and a separate active-model snapshot

Compared with allowing providers to render fully custom settings UIs, this is better because:

- the platform keeps a stable shared interaction pattern
- tests remain centered on data contracts instead of arbitrary UI behavior
- the renderer avoids becoming a host for unrelated provider-specific frontends

## Provider Contract

### Descriptor Extensions

Both `LLMProviderDescriptor` and `ASRProviderDescriptor` should gain optional settings metadata:

```ts
type ProviderSettingsItem =
  | SelectSettingsItem
  | TextSettingsItem
  | PasswordSettingsItem
  | ToggleSettingsItem
  | ModelSelectSettingsItem

type ProviderSetupStatus = {
  status: 'not-connected' | 'configured' | 'invalid' | 'ready'
  canActivate: boolean
  summary?: string
  blockingReasons: string[]
  fieldErrors?: Record<string, string>
}

type ProviderSetupContext = {
  connection: ProviderConnectionRecord | undefined
  settings: Record<string, unknown> | undefined
}
```

Recommended new descriptor fields:

```ts
settingsSchema?: ConfigSchema<TSettings>
settingsItems?: ProviderSettingsItem[]
getSetupStatus?: (
  context: ProviderSetupContext
) => Promise<ProviderSetupStatus> | ProviderSetupStatus
```

The provider remains responsible for describing:

- which settings exist
- which settings are required
- how each field should be validated
- whether the provider is actually ready to activate

The platform remains responsible for:

- rendering standard item types
- persisting validated settings
- invoking `getSetupStatus()`
- showing row badges, helper text, and disabled activation states

### Standard Item Types

The first pass should support only a small standard set:

- `select`
- `text`
- `password`
- `toggle`
- `model-select`

Every item should have a stable `key`, `label`, and `description`.

`model-select` is intentionally part of the generic settings system. It is not an LLM-only dialog concept anymore.

The first pass should not add an escape hatch for provider-rendered custom components. That can be considered later if a real provider cannot fit the schema-driven path.

### Setup Status Contract

`getSetupStatus()` returns a normalized result consumed across the app.

Semantics:

- `not-connected`: no valid connection record exists yet
- `configured`: connected, but required settings for activation are still missing
- `invalid`: connected, but current settings or remote validation failed
- `ready`: connected and settings are sufficient for activation and runtime use

`canActivate` is the canonical activation gate. The renderer should not add provider-specific activation logic on top of it.

`blockingReasons` gives user-facing reasons for disabled activation. `fieldErrors` maps validation failures back to form items.

## Persistence Model

### Persisted State

The existing provider store should move to:

```ts
type ProviderSettingsState = {
  providers: Record<string, ProviderConnectionRecord | undefined>
  providerSettings: Record<string, Record<string, unknown> | undefined>
  activeProviders: {
    llm?: string
    asr?: string
  }
}
```

Default value:

```ts
{
  providers: {},
  providerSettings: {},
  activeProviders: {}
}
```

Persistence semantics:

- `providers[providerId]` stores connection metadata only
- `providerSettings[providerId]` stores every provider-defined settings item, including `model`
- `activeProviders` stores the selected provider id for each pipeline

This deliberately removes:

- `providerModels`
- `activeModels`

Those fields exist to preserve an older saved-model versus active-model split that no longer matches the intended product behavior.

### Normalization

Normalization rules should:

- preserve existing connection records
- backfill missing `providerSettings` as an empty object
- preserve `activeProviders`
- drop active provider ids that no longer have a corresponding connection record
- leave provider-defined settings untouched unless a descriptor schema later parses them differently

### Disconnect Behavior

Disconnecting a provider should:

- remove `providers[providerId]`
- remove `providerSettings[providerId]`
- clear the matching slot in `activeProviders` if that provider was active

This keeps connection state, settings state, and active selection aligned.

## Runtime Data Flow

### Single Source Of Truth

Runtime should stop relying on a separate active-model snapshot.

The runtime path becomes:

1. read `activeProviders.<capability>`
2. read that provider's connection record from `providers`
3. read that provider's current settings from `providerSettings`
4. let the provider combine connection config plus current settings into the effective runtime config

This means that editing the active provider's settings changes subsequent runtime behavior immediately after save.

That is an intentional product decision.

### LLM Runtime

For active LLM runtime resolution:

- resolve the active provider id
- resolve its connection config
- resolve its current provider settings
- obtain the final LLM provider runtime config from those values
- when a model is needed, read it from `providerSettings[providerId].model`

`resolveActiveLLMModel()` and similar helpers tied to `activeModels` should be removed or folded into a new runtime selection helper.

### ASR Runtime

For active ASR runtime resolution:

- resolve the active provider id
- resolve its connection config
- resolve its current provider settings
- pass both into provider-specific runtime resolution

For Deepgram specifically:

- `defaultLanguage` should live in `providerSettings['deepgram'].language`
- runtime request-level overrides such as `options.language` still take precedence over the saved default

## UI Behavior

### Provider Row

Every provider row should use one shared state model:

- not connected: show `Connect`
- connected with settings support: show `Settings`
- connected and `canActivate = true` and not current: show `Set as active`
- connected and current active provider: show `Current`

The row should render status from `getSetupStatus()`:

- badge or secondary status label
- short summary copy
- disabled activation with provider-supplied blocking reason when needed

The renderer should not infer readiness from ad hoc checks such as "saved model exists".

### Settings Dialog

`ProviderModelSettingsDialog` should be replaced by `ProviderSettingsDialog`.

Responsibilities:

- render all declared `settingsItems` for the selected provider
- load any data source needed for standard item types such as `model-select`
- parse and persist values through `settingsSchema`
- save only provider-defined settings, never active selection
- re-run `getSetupStatus()` after save and refresh row state

If the edited provider is already active, the new settings become effective for future runtime calls immediately after save.

### Activation

`Set as active` should only write:

```ts
activeProviders.llm = providerId
```

or

```ts
activeProviders.asr = providerId
```

It should not copy settings or model values anywhere else.

### Settings Support Discovery

The renderer should consider a provider to support a settings dialog when:

- `settingsItems` is non-empty

`getSetupStatus()` remains independent from the dialog. A provider may participate in readiness reporting even if it does not expose editable settings items.

This keeps settings visibility and readiness capability-driven without hardcoding provider ids.

## Initial Provider Coverage

The first implementation pass should stay narrow.

### LLM Providers

Migrate current LLM model selection into provider-defined settings:

- `openai`: `model-select`
- `openrouter`: `model-select`
- `openai-codex`: `model-select`

These providers should report:

- `configured` when connected but no model is selected
- `ready` when connected and a valid model is selected

### Deepgram

Add one provider-defined settings item:

- `language`: `select`

First-pass Deepgram settings should remain intentionally small. Do not add a broad matrix of optional Deepgram toggles yet.

Deepgram readiness should stay simple:

- `configured` when connected but required defaults are incomplete, if the product decides language is required
- `ready` when connected and settings are acceptable

If the product treats language as optional with a provider default fallback, Deepgram can report `ready` immediately after connection and still expose `Settings` for customization.

## Migration

This design replaces the persistence assumptions in earlier model-selection work.

Specifically, the persisted-state decisions from these design docs must be superseded:

- `docs/superpowers/specs/2026-04-02-llm-provider-model-selection-design.md`
- any follow-on work that assumes `providerModels` and `activeModels`

Migration requirements:

- move any existing `providerModels[providerId].model` value into `providerSettings[providerId].model`
- discard `activeModels`
- preserve `activeProviders`
- update runtime helpers to resolve model from `providerSettings`

The migration should be tolerant of mixed older state on disk and normalize it forward on load.

## Testing

Shared tests should cover:

- descriptor typing for settings metadata
- normalization of `providerSettings`
- migration from `providerModels` and `activeModels`
- disconnect cleanup across `providers`, `providerSettings`, and `activeProviders`

Renderer tests should cover:

- unified settings button rendering
- settings dialog rendering for standard item types
- disabling `Set as active` from provider-supplied status
- updating an active provider's settings and reflecting immediate future-state behavior

Runtime tests should cover:

- resolving active provider plus current `providerSettings`
- removal of `activeModels` assumptions
- Deepgram runtime fallback from saved default language to per-request override

Provider-specific tests should cover:

- LLM providers reporting `configured` without `model`
- LLM providers reporting `ready` with valid `model`
- Deepgram descriptor and readiness behavior for saved `language`

## Implementation Notes

Keep the first pass disciplined:

- no provider-specific renderer branches for Deepgram versus LLM providers
- no custom panel escape hatch
- no broad provider settings taxonomy beyond the initial standard item types
- no attempt to redesign unrelated provider page behavior while introducing this contract

The success condition is a stable provider-defined settings platform, not an exhaustive provider settings catalog.
