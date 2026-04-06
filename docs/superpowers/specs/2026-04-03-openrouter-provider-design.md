# OpenRouter Provider Design

**Date:** 2026-04-03

## Superseded By 2026-04-06 Provider-Defined Settings

This document's persistence and activation model is partially superseded by `docs/superpowers/specs/2026-04-06-provider-defined-settings-design.md`.

Use:

```ts
{
  providers: {},
  providerSettings: {},
  activeProviders: {}
}
```

Do not introduce new code that depends on `providerModels` or `activeModels`.

## Goal

Add a new `openrouter` LLM provider under `packages/providers/src/llm/providers` and integrate it into the desktop app so it can be connected, configured, activated, and used by the real LLM runtime.

The immediate product goals are:

- expose `OpenRouter` as a first-class LLM provider in the Providers page
- let users connect it with an API key
- list models that are actually available to the current OpenRouter user and API key
- let users save a model, set the provider active, and run the real runtime through it

The engineering goal is to implement OpenRouter strictly through the shared LLM provider contract in `packages/providers/src/llm`, without reusing `openai` provider code or coupling the design to OpenAI-specific internals.

## Scope

This design covers:

- a new `openrouter` LLM provider descriptor and provider implementation
- package exports for the new provider
- desktop registry registration
- Providers page connection and model-selection flow through existing shared UI
- runtime resolution and real LLM invocation through the active provider path
- tests in both `packages/providers` and `apps/desktop`

This design does not include:

- OpenRouter-specific advanced routing controls
- user-configurable `HTTP-Referer`, `X-Title`, or other optional request metadata
- refactoring the existing `openai` provider
- introducing a shared OpenAI-compatible abstraction layer
- redesigning the Providers page

## Current State

The repository already has:

- a shared LLM provider contract in `packages/providers/src/llm/contracts.ts`
- an LLM registry in `packages/providers/src/llm/registry.ts`
- desktop registration for `openai` and `openai-codex`
- a Providers page that can connect providers, fetch model lists, save a provider-level model, and set an active provider plus active model
- main-process runtime helpers that resolve the active LLM provider and active model before running the pipeline

The current gap is that OpenRouter is not represented as a provider at all:

- there is no `openrouter` descriptor or provider implementation
- `packages/providers/package.json` does not export `./llm/openrouter`
- the desktop registry cannot list or resolve OpenRouter
- the runtime cannot activate or invoke OpenRouter

## Decision Summary

The app will add `openrouter` as a fully independent LLM provider that implements only the shared LLM interfaces.

Key decisions:

- `openrouter` is a peer of `openai` and `openai-codex`, not a wrapper around `openai`
- the provider implementation will use `@openrouter/sdk`
- the provider will not import or reuse anything from `packages/providers/src/llm/providers/openai`
- model listing will use the user-filtered OpenRouter model API so the UI reflects models available to the current API key
- the existing desktop connection, model-selection, activation, and runtime flows remain the only integration path

## Why This Shape

This design matches the product and codebase constraints from the design session:

- the user wants OpenRouter to be represented as its own provider, not as an OpenAI-compatible variant
- the current repository already has a stable provider abstraction, so a new provider should depend on that abstraction and nothing lower-level
- using `@openrouter/sdk` keeps the transport semantics aligned with the provider being added instead of indirectly depending on another provider's implementation choices

Compared with reusing the `openai` provider, this is better because:

- provider boundaries stay explicit
- future OpenRouter-specific behavior can be added without inheriting OpenAI assumptions
- tests verify OpenRouter behavior directly instead of through shared helpers that were designed for another provider

Compared with introducing a shared compatibility layer first, this is better because:

- the scope stays focused on one provider
- the current task does not become a refactor of the whole LLM provider subsystem
- the risk of unrelated regressions stays lower

## Architecture

### New Files

Recommended new files:

- `packages/providers/src/llm/providers/openrouter/index.ts`
- `packages/providers/src/llm/providers/openrouter/provider.ts`
- `packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts`
- `packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts`

### Existing Files To Update

- `packages/providers/package.json`
- `apps/desktop/src/main/providers/index.ts`

No UI-specific files need provider-specific branches if the descriptor and runtime contract are correct. The current Providers page already derives behavior from provider descriptors, saved model state, and active provider state.

## Provider Contract

### Provider Id and Display Metadata

The new descriptor will use:

- `id: 'openrouter'`
- `displayName: 'OpenRouter'`
- a short description focused on routing across multiple model providers through OpenRouter

Capabilities should declare:

- `streaming: true`
- `nonStreaming: true`
- `functionCalling: true`
- `vision: true`
- `jsonMode: true`

These values align the provider with the current LLM capability model while staying broad enough for the existing UI and runtime. This task does not require per-model capability detection.

### Configuration Shape

The initial provider config stays minimal:

```ts
type OpenRouterConfig = {
  apiKey: string
}
```

`index.ts` should define a `zod` schema that requires a non-empty `apiKey`.

The provider connection metadata should expose one API key connection option so the existing `ProviderConnectDialog` can render it without any custom UI path.

### Independence Requirement

The `openrouter` provider must only depend on:

- `packages/providers/src/llm/contracts.ts`
- shared package-level error and type helpers that are provider-agnostic
- `@openrouter/sdk`

It must not depend on:

- `packages/providers/src/llm/providers/openai/*`
- `OpenAIConfig`
- helper functions copied by import from the `openai` provider directory

## Runtime Data Flow

### `isConfigured()`

`isConfigured()` returns `true` when `apiKey` exists and is non-empty.

This matches the current provider contract: local validation answers whether the provider has enough configuration to attempt runtime calls.

### `listModels()`

`listModels()` will call the OpenRouter SDK API for models filtered by the current user and API key.

The mapped output should be:

```ts
{
  id: model.id,
  name: model.name || model.id,
  contextWindow: model.context_length
}
```

Behavior requirements:

- use the user-filtered model list, not the public global model list
- return a stable sorted `LLMModel[]`
- prefer deterministic sorting by `name`, then `id`
- do not silently substitute a fake default model when the API returns none

This keeps the Providers model settings dialog aligned with what the user can really activate.

### `generate()`

`generate()` will use `@openrouter/sdk` for a non-streaming chat/completions request and map the result into:

- `content`
- `finishReason`
- optional `usage`

The provider implementation should preserve the shared request mapping used by the package-level contract:

- `request.model`
- `request.messages`
- `request.temperature`
- `request.maxTokens`
- `request.signal`

The desktop runtime should not need any OpenRouter-specific branches to invoke it.

### `complete()`

`complete()` will use the SDK streaming API and emit `CompletionChunk` values as deltas arrive.

Behavior requirements:

- emit text deltas incrementally
- normalize the terminal finish reason into the shared contract values
- if the stream finishes without text in the last event but does provide a terminal reason, still emit the terminal chunk

This keeps middleware and runtime behavior consistent with the existing LLM contract.

## Desktop Integration

### Package Export

`packages/providers/package.json` will export:

```json
"./llm/openrouter": "./src/llm/providers/openrouter/index.ts"
```

### Registry Registration

`apps/desktop/src/main/providers/index.ts` will import and register `openrouterDescriptor` in the existing `llmRegistry`.

After this, the desktop TRPC provider listing flow will include OpenRouter automatically through the existing registry-backed queries.

### Providers Page

No OpenRouter-specific UI branch is required.

The existing Providers page behavior should work unchanged:

- connect OpenRouter through the descriptor-defined API key form
- fetch models through the existing `trpc.providers.listModels` flow
- save a provider-level model under `providerModels.openrouter`
- set it active through `activeProviders.llm = 'openrouter'` and `activeModels.llm = <saved-model>`

This is an explicit requirement of the design. If implementation reveals a need for provider-specific UI conditionals, that should be treated as a design regression and justified separately.

### Runtime Activation

The existing active-provider runtime flow remains the only activation path:

1. connect OpenRouter
2. save a model for `openrouter`
3. set OpenRouter active
4. runtime resolves `openrouter` and the active model through `resolveActiveLLMSelection()`
5. the post-recording pipeline uses the resolved provider and model for a real LLM request

## Error Handling

### Unconfigured Provider

If runtime methods are called before configuration is present, `listModels()`, `generate()`, and `complete()` must throw:

```ts
new ConfigurationError('openrouter', 'Provider is not configured')
```

This keeps behavior aligned with the existing provider implementations.

### SDK Failures

If the SDK request fails:

- do not hide the underlying error message
- make sure the error can still be attributed to `openrouter` in logs and tests

The exact error-wrapping shape can stay lightweight as long as the provider id remains visible at the provider boundary and the original failure message is preserved.

### Empty Model List

If OpenRouter returns zero models:

- `listModels()` returns `[]`
- the provider does not invent fallback models
- later activation or runtime failures are handled by the existing active-model selection flow

This preserves a truthful UI and avoids hidden assumptions about what the user can access.

## Testing

### `packages/providers`

`descriptor.test.ts` should cover:

- descriptor id and display name
- capabilities
- API key connection fields
- config schema acceptance and rejection
- `create()` returning an `openrouter` provider

`provider.test.ts` should mock `@openrouter/sdk` and cover:

- `isConfigured()` for configured and unconfigured states
- user-filtered model list mapping
- deterministic model sorting
- non-streaming generation result mapping
- streaming delta mapping
- finish-reason normalization
- unconfigured method failures
- SDK request failure propagation

### `apps/desktop`

Desktop integration tests should cover:

- registry registration includes `openrouter`
- Providers page renders the new LLM provider
- API key connection persists an enabled manual provider record
- model selection persists a saved model for `openrouter`
- setting OpenRouter active writes both `activeProviders.llm` and `activeModels.llm`
- runtime resolution returns the OpenRouter provider and selected model
- a real runtime invocation path can call `generate()` or `complete()` through the active-selection flow

This is the minimum test coverage needed to support the requested success condition of end-to-end desktop and runtime integration.

## Acceptance Criteria

This work is complete when all of the following are true:

- `@openbroca/providers/llm/openrouter` exists and is exported
- `openrouter` appears in the desktop Providers page
- users can connect it with an API key
- users can fetch models filtered to the current OpenRouter user and key
- users can save a model and set OpenRouter active
- the active LLM runtime resolves `openrouter` plus the selected model
- the desktop pipeline can invoke the provider through the real runtime path
- no code is reused from the `openai` provider implementation

## Implementation Notes

The implementation should stay focused on the provider addition itself.

It should avoid:

- refactoring shared LLM abstractions unless required to satisfy the existing contract
- changing the provider settings data model
- broad UI cleanup unrelated to OpenRouter
- adding optional configuration inputs that were intentionally left out of scope
