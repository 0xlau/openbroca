# LLM Non-Streaming Interface Design

**Date:** 2026-03-28

## Goal

Extend the `providers/llm` abstraction so callers can request a full completion result directly without having to consume a stream when they do not need incremental output.

The user-facing goal is to make the common path simple: most application code should be able to ask for one complete answer and receive a normalized `CompletionResult`.

The engineering goal is to preserve the existing streaming foundation while adding a first-class non-streaming interface that:

- keeps `complete()` available for progressive output
- allows providers to implement an optimized native non-streaming path
- provides a shared fallback for providers that only implement streaming
- keeps middleware and registry behavior consistent across both invocation styles

## Current State

The current `LLMProvider` contract is centered entirely on streaming:

- `LLMProvider.complete(request): AsyncIterable<CompletionChunk>`
- `CompletionFn` and `LLMMiddleware` are defined only for stream handlers
- `LLMProviderRegistry` only wraps `complete()` when middleware is present
- the OpenAI provider only calls the streaming chat completion API

This creates a mismatch for the dominant use case. Callers that only want a final answer must manually collect chunks, infer the final finish reason, and accept that token usage may be unavailable even when the upstream provider could have returned it directly.

## Decision Summary

The LLM provider platform will support two first-class completion modes:

- `generate(request): Promise<CompletionResult>` for full-result consumers
- `complete(request): AsyncIterable<CompletionChunk>` for streaming consumers

`complete()` remains the lower-level streaming primitive. `generate()` becomes a required part of the `LLMProvider` interface and the default entry point for most application code.

Providers may implement `generate()` in one of two ways:

- native non-streaming API call when the upstream provider supports it
- shared fallback that consumes `complete()` and aggregates the final result

The provider platform must treat both methods as real contract surface, not as a helper layered outside the provider. Registry wrapping, middleware composition, tests, and capability metadata all need to account for both paths.

## Interface Design

### Provider Contract

`LLMProvider` will expose both methods:

```ts
interface LLMProvider {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  listModels(signal?: AbortSignal): Promise<LLMModel[]>
  generate(request: CompletionRequest): Promise<CompletionResult>
  complete(request: CompletionRequest): AsyncIterable<CompletionChunk>
}
```

This makes the high-level and low-level completion paths explicit:

- `generate()` means "return the final normalized answer"
- `complete()` means "stream normalized chunks as they arrive"

Callers should not need to know whether `generate()` is backed by a native non-streaming request or a fallback aggregation path.

### Shared Fallback

The package will provide a shared fallback implementation for `generate()` that aggregates the stream returned by `complete()`.

Recommended shape:

```ts
function generateFromCompletion(
  complete: (request: CompletionRequest) => AsyncIterable<CompletionChunk>,
): (request: CompletionRequest) => Promise<CompletionResult>
```

This helper should:

- iterate every yielded `CompletionChunk`
- concatenate `chunk.delta` values into one final string
- retain the last non-null `finishReason`
- return a normalized `CompletionResult`
- rethrow stream errors without translation unless a provider deliberately wraps them

The fallback is intended to remove duplicate aggregation logic from providers and tests. It is not meant to hide provider-native optimizations.

### Native Provider Override

Providers with a better upstream non-streaming API should implement `generate()` directly.

A native implementation is preferred when it can provide any of the following:

- stable token usage metadata
- more reliable final finish reasons
- lower overhead than opening and consuming a stream
- better mapping for provider-specific response semantics

The OpenAI provider is the first intended reference implementation for this pattern.

## Result Semantics

`CompletionResult` remains the standard non-streaming return type:

```ts
interface CompletionResult {
  content: string
  finishReason: 'stop' | 'length'
  usage?: TokenUsage
}
```

### Field Rules

- `content` is always the full final text
- `finishReason` should use the provider-native value when available
- if `generate()` falls back to stream aggregation, it should use the last non-null chunk `finishReason`
- if the fallback path sees no finish reason, it should default to `'stop'`
- `usage` is optional and should only be filled when the provider can return trustworthy usage data

This design intentionally keeps `CompletionResult` small. It does not expose whether the result came from a native non-streaming request or a stream aggregation fallback. That distinction is an internal implementation detail unless a future product requirement makes it useful to surface.

## Middleware Design

The existing middleware abstraction only wraps streaming handlers. That is no longer sufficient once `generate()` becomes a first-class provider method.

The provider platform will introduce separate handler types for streaming and full-result paths:

```ts
type CompletionStreamFn = (request: CompletionRequest) => AsyncIterable<CompletionChunk>
type CompletionGenerateFn = (request: CompletionRequest) => Promise<CompletionResult>
```

Middleware should evolve into an object-style contract so each path can be wrapped independently:

```ts
interface LLMMiddleware {
  wrapGenerate?: (next: CompletionGenerateFn) => CompletionGenerateFn
  wrapComplete?: (next: CompletionStreamFn) => CompletionStreamFn
}
```

This design avoids two problems:

- native `generate()` implementations bypassing middleware entirely
- forcing non-streaming logic to be represented as a disguised streaming wrapper

The middleware composition helpers should preserve the current ordering guarantees:

- outermost middleware enters first
- innermost middleware calls the provider implementation
- cleanup in `try/finally` still works for early stream termination

## Registry Behavior

`LLMProviderRegistry` will continue to resolve one provider instance per provider id and config, but middleware wrapping must cover both completion paths.

Required changes:

- `resolve()` still validates config and constructs the provider once
- when middleware exists, registry wraps both `generate()` and `complete()`
- `getCapabilities()` must return capability defaults that include non-streaming support metadata

Recommended behavior:

- keep the wrapping logic in one place inside `wrapWithMiddleware()`
- proxy `generate` and `complete` separately rather than trying to derive one from the other inside the registry

The registry should not be responsible for inventing a `generate()` implementation for providers. The required provider contract and shared fallback helper already solve that boundary more cleanly.

## Capability Model

`LLMCapabilities` currently exposes `streaming`, `functionCalling`, `vision`, and `jsonMode`.

This design adds:

- `nonStreaming: boolean`

Default capability behavior should become:

```ts
const DEFAULT_CAPABILITIES = {
  streaming: false,
  nonStreaming: true,
  functionCalling: false,
  vision: false,
  jsonMode: false,
}
```

`nonStreaming` is expected to be `true` for all compliant providers in this design because `generate()` is mandatory. The field is still useful because:

- it documents the completion mode explicitly in provider metadata
- it keeps the capability model symmetric for callers and UI
- it leaves room for future edge cases if a provider contract changes or becomes partially unavailable

This design does not add a separate capability to distinguish native non-streaming support from stream-derived fallback. That detail can remain internal until there is a concrete need to expose it.

## OpenAI Provider Design

`packages/providers/src/llm/providers/openai/provider.ts` will become the reference dual-mode implementation.

### `complete()`

Keep the current streaming behavior:

- call `client.chat.completions.create(..., { stream: true })`
- map each upstream delta into `CompletionChunk`
- propagate finish reasons through chunks as they arrive

### `generate()`

Add a native non-streaming branch:

- call `client.chat.completions.create(..., { stream: false })`
- read the first choice from the response
- map assistant content to `CompletionResult.content`
- map upstream `finish_reason` to normalized `finishReason`
- map usage fields to `TokenUsage`

This lets OpenAI return richer and more stable metadata than a fallback stream aggregation would provide.

## Error Handling

The platform should keep error behavior straightforward and predictable.

### `generate()`

- native provider implementations may translate upstream SDK errors into existing provider error types where appropriate
- fallback aggregation should not swallow or rewrite stream errors by default
- if `request.signal` is aborted, native and fallback paths should both reject promptly

### `complete()`

- existing error propagation semantics should remain unchanged
- middleware cleanup must still run on consumer cancellation and thrown errors

This design does not add a new error taxonomy. It reuses the current provider error model and focuses only on making both completion modes observable and consistent.

## Testing Strategy

### Contract and Middleware Tests

Add tests that verify:

- `generate` middleware wraps handlers in the same outermost-first order as `complete`
- `complete` middleware behavior does not regress
- middleware can modify requests independently for each path
- cleanup behavior remains correct when a stream consumer exits early

### Fallback Aggregation Tests

Add tests for the shared fallback helper to verify:

- multiple deltas are concatenated in order
- the last non-null finish reason is retained
- missing finish reason defaults to `'stop'`
- thrown stream errors reject `generate()`

### Registry Tests

Add or update tests to verify:

- resolved providers expose wrapped `generate()` and wrapped `complete()`
- middleware does not mutate the original provider object
- capability defaults include `nonStreaming`

### Provider Tests

Add or update OpenAI provider tests to verify:

- `generate()` uses the non-streaming SDK path
- `generate()` maps content, finish reason, and usage correctly
- `complete()` continues to stream normalized chunks correctly

## Scope Boundaries

This design includes:

- the `LLMProvider` contract change
- shared fallback logic for `generate()`
- middleware evolution for both completion modes
- registry wrapping for `generate()` and `complete()`
- capability metadata updates
- OpenAI dual-mode provider behavior
- test coverage for the new abstraction

This design does not include:

- renderer or desktop UI changes to consume `generate()`
- request/response schema changes beyond the new provider method and capability
- provider-specific metadata beyond existing `CompletionResult`
- changes to ASR provider contracts
- adding new LLM providers

## Implementation Notes

To keep the change isolated and low-risk:

- preserve existing streaming method names and chunk types
- introduce the new `generate()` path without forcing immediate consumer migration
- centralize fallback aggregation in shared LLM contract utilities rather than duplicating it across providers
- make OpenAI the example native implementation before extending the pattern to future providers

This sequencing allows the package to gain a cleaner high-level interface while remaining fully backward-compatible for current streaming consumers.
