# Provider Activation Design

**Date:** 2026-04-02

## Goal

Introduce an explicit provider activation model for the desktop app so LLM and ASR provider connections are no longer conflated with the single provider each pipeline actually uses.

The immediate product goal is:

- users can connect multiple LLM providers
- users can connect multiple ASR providers
- each category still has exactly one provider that is actively used by the real pipeline

The engineering goal is to separate connection state from activation state so UI, persistence, and runtime selection all describe the same behavior.

## Current State

The current providers page persists a single `providers` object keyed by provider id. Each entry only describes whether a provider is connected and how it is connected.

Example:

```ts
providers: {
  openai: {
    enabled: true,
    connectionType: 'apiKey',
    config: { apiKey: 'sk-...' }
  },
  deepgram: {
    enabled: true,
    connectionType: 'apiKey',
    config: { apiKey: 'dg-...' }
  }
}
```

This model is missing a second layer that answers a different question:

- which connected LLM provider should the app actually use right now
- which connected ASR provider should the app actually use right now

As a result:

- the page only expresses connect or disconnect state
- the future "Set as active" action has nowhere clean to persist its choice
- runtime code cannot rely on a single source of truth for provider selection

## Decision Summary

The desktop app will split provider state into two persisted concerns:

- `providers`: connection records only
- `activeProviders`: active provider ids by capability category

Recommended shape:

```ts
type ActiveProviders = {
  llm?: string
  asr?: string
}

type ProviderSettings = {
  providers: Record<string, ProviderConnectionRecord | undefined>
  activeProviders: ActiveProviders
}
```

This decision intentionally keeps the existing provider connection record format intact. The new work adds a separate activation layer instead of extending each connection record with activation flags.

## Why This Shape

This design separates two responsibilities that evolve independently:

- connection state answers "can this provider be used"
- activation state answers "which provider is currently chosen"

Compared with storing activation flags inside each provider record, a separate `activeProviders` object is better because:

- it cleanly supports many connected providers with one active provider per category
- it avoids scanning all provider records to infer the active choice
- it makes disconnect behavior straightforward because the relevant slot can be cleared directly
- it keeps provider connection records reusable if a provider later supports more than one role or if the app adds more capability categories

## Data Model

### Renderer Store

The renderer `providerStore` will move from a flat map to a structured object:

```ts
type ProviderSettings = {
  providers: Record<string, ProviderConnectionRecord | undefined>
  activeProviders: {
    llm?: string
    asr?: string
  }
}
```

Default persisted value:

```ts
{
  providers: {},
  activeProviders: {}
}
```

### Main Store

The main Electron store should persist the same shape so renderer and runtime reason about the same data model.

This design intentionally avoids a split where renderer tracks activation locally but main process still only knows about connection records. The desktop runtime will need activation state to select the actual provider used by each pipeline.

### Connection Records

`ProviderConnectionRecord` does not change shape in this design.

Examples:

```ts
providers: {
  openai: {
    enabled: true,
    connectionType: 'apiKey',
    config: { apiKey: 'sk-...' }
  },
  'openai-codex': {
    enabled: true,
    connectionType: 'oauth',
    account: { email: 'user@example.com' },
    auth: {
      status: 'connected',
      lastConnectedAt: '2026-04-02T10:00:00.000Z'
    }
  }
}
```

Activation remains outside those records:

```ts
activeProviders: {
  llm: 'openai',
  asr: 'deepgram'
}
```

## UI Behavior

### Page Copy

The providers page should explain the two-step model explicitly.

Current copy:

- `Manage API credentials for ASR and LLM Providers.`

Recommended copy:

- `Connect multiple providers, then choose which one each pipeline uses.`

This reduces the chance that users interpret connection as immediate activation.

### Provider Row Actions

Each provider row will have one connection action and, when relevant, one activation action.

#### Connection Action

The primary action remains:

- `Connect` when the provider is not connected
- `Disconnect` when the provider is connected

This action only affects `providers`.

#### Activation Action

The activation action is capability-specific and only appears for connected providers:

- not connected: no activation action
- connected but not active for this section: show `Set as active`
- connected and active for this section: show `Active`

For the LLM section, activity is determined by:

```ts
activeProviders.llm === provider.id
```

For the ASR section, activity is determined by:

```ts
activeProviders.asr === provider.id
```

The `Active` state is informational. It must not trigger a write when clicked.

### Connect Flow

Connecting a provider only creates or updates the connection record.

Required behavior:

- manual providers persist their connection record under `providers[providerId]`
- OAuth providers persist their connection record through the existing auth flow
- connect success does not automatically set `activeProviders.llm` or `activeProviders.asr`

This is intentional. The product decision is that activation remains a separate explicit user action after connection.

### Set Active Flow

Clicking `Set as active` only updates the matching capability slot:

- from the LLM section, write `activeProviders.llm = provider.id`
- from the ASR section, write `activeProviders.asr = provider.id`

This action must not:

- change the connection method
- rewrite provider config
- affect the other capability category

Example:

- setting `deepgram` active for ASR must not change `activeProviders.llm`
- setting `openai` active for LLM must not change any ASR connection record

### Disconnect Flow

Disconnect keeps its current connection semantics and adds activation cleanup.

Required behavior:

- remove or invalidate the connection record as it does today
- if the disconnected provider is the active provider for that capability category, clear that slot

Examples:

- disconnecting the active LLM provider clears `activeProviders.llm`
- disconnecting the active ASR provider clears `activeProviders.asr`
- disconnecting a non-active provider leaves `activeProviders` unchanged

The app must not block disconnect with a "switch first" guard. The selected behavior is automatic cleanup.

## Runtime Behavior

### Active Provider Resolution

The main process will add a small provider selection layer that reads the active provider ids from persisted settings.

Recommended helpers:

```ts
getActiveLLMProviderId(store): string | undefined
getActiveASRProviderId(store): string | undefined
```

These helpers are intentionally simple and do not construct providers themselves. They only expose the chosen provider ids for downstream runtime code.

### Runtime Selection Contract

When a real LLM or ASR pipeline needs a provider, it should use the active selection instead of relying on an arbitrary provider id from the renderer.

The runtime contract becomes:

- read `activeProviders.llm` or `activeProviders.asr`
- if the slot is empty, raise a clear configuration error
- if the slot points to a provider that is no longer connected, raise a clear configuration error
- if the slot is valid, resolve that provider using existing registry logic

This design is intentionally defensive even though disconnect cleanup should prevent stale active ids under normal behavior.

### Transition Strategy

This design does not require every provider-consuming flow to migrate in the same small UI patch, but it does require the repository to establish the active-provider source of truth in main process storage now.

Implementation should avoid a half-state where:

- renderer writes `activeProviders`
- runtime continues to ignore it completely

At minimum, the runtime layer should gain the read helpers and tests in the same branch so future pipeline integration has a stable contract.

## Component Responsibilities

### `providers.tsx`

Owns:

- reading structured provider settings from the store
- passing `providers` and `activeProviders` into the provider sections
- handling connect, disconnect, and set-active actions

### `ProviderSection`

Owns:

- knowing which capability section it represents
- passing capability context to each row so rows can derive activity correctly

A small explicit section key is preferred over inferring capability from provider descriptor shape.

Recommended values:

- `sectionKey: 'llm' | 'asr'`

### `ProviderRow`

Owns:

- rendering connection state
- rendering activation state
- surfacing `Connect`, `Disconnect`, `Set as active`, or `Active` according to the rules above

`ProviderRow` should not mutate persisted state directly. It should receive capability context and callbacks from the parent container.

## Error Handling

### UI Guards

The UI must not allow activation for an unconnected provider.

If a stale state somehow occurs, the write path should still defend against it by checking that a connection record exists before setting active state.

### Runtime Errors

Runtime selection failures should use explicit errors rather than silent fallback.

Expected failure cases:

- no active provider selected for the requested capability
- active provider id exists but has no connection record
- active provider record exists but is disabled or incomplete

This design does not include automatic fallback to another connected provider. The user must explicitly choose the provider to use.

## Testing Strategy

### Store Tests

Add or update tests to verify:

- default settings include both `providers` and `activeProviders`
- updating connection records does not overwrite `activeProviders`
- updating `activeProviders` does not overwrite connection records

### Providers Page Tests

Add or update tests to verify:

- connected but inactive providers show `Set as active`
- active providers show `Active`
- activation writes only the slot for the current capability
- activating one LLM provider replaces the previous active LLM provider
- activating one ASR provider replaces the previous active ASR provider
- LLM activation does not affect ASR activation
- ASR activation does not affect LLM activation
- disconnecting an active provider clears the matching active slot
- disconnecting a non-active provider leaves the active slot unchanged

### Runtime Tests

Add or update tests to verify:

- active LLM provider ids can be read from persisted settings
- active ASR provider ids can be read from persisted settings
- missing active selection raises a clear configuration error
- stale active ids raise a clear configuration error

## Scope Boundaries

This design includes:

- explicit activation state for LLM and ASR providers
- UI support for setting the active provider after connection
- disconnect cleanup for active selections
- main-process support for reading the active provider selection
- tests for state separation and selection behavior

This design does not include:

- automatic activation on connect
- fallback to another connected provider when the active one is missing
- a redesign of the provider connection dialog
- adding provider priority, ordering, or weighted routing
- broader pipeline refactors beyond reading the active provider selection contract

## Migration Notes

Existing persisted `providers` data will not match the new structured `ProviderSettings` shape.

The implementation must handle this by migrating or normalizing old persisted data into:

```ts
{
  providers: {
    openai: {
      enabled: true,
      connectionType: 'apiKey',
      config: { apiKey: 'sk-...' }
    }
  },
  activeProviders: {}
}
```

This migration should preserve existing connection records and start with no active provider selected.

The design deliberately avoids inventing implicit activation during migration because that would guess user intent.
