# ASR Provider Interface Design

**Date:** 2026-04-02

## Goal

Redesign the ASR provider platform so it is easy for third-party contributors to integrate providers according to their real capabilities instead of forcing every provider into a streaming-only contract.

The primary product goal is to make one-shot transcription the default path for application code because the current desktop workflow processes a completed recording after capture ends.

The primary platform goal is to make the public provider contract honest, stable, and contributor-friendly:

- batch-only providers must be first-class citizens
- streaming must be modeled as an optional enhancement, not a hidden requirement
- provider descriptors must clearly communicate supported capabilities
- the platform must avoid inventing fake capabilities on behalf of providers

## Current State

The current ASR contract is centered entirely on streaming:

- `ASRProvider.transcribe(audio, options): AsyncIterable<TranscriptionSegment>`
- `audio` is modeled as `AsyncIterable<Uint8Array>`
- both built-in providers implement this streaming shape
- desktop post-recording orchestration manually aggregates final segments into one transcript

This creates a mismatch with the dominant app workflow and with the needs of an open provider ecosystem.

### Current Product Mismatch

The current desktop voice pipeline is explicitly one-shot:

- user starts recording
- user stops recording
- the app processes one finished recording as a single batch

That means the main consumer wants a final recognition result, not a stream primitive.

### Current Platform Mismatch

The existing ASR platform assumes every provider can produce progressive output from a streaming audio source.

That assumption does not hold for many real providers:

- some providers only accept uploaded files or full audio payloads
- some providers only return a final result
- some providers expose richer one-shot metadata than a stream aggregation can preserve

Under the current contract, those providers can only join the platform by either:

- implementing an unnatural fake stream wrapper
- or being excluded from the provider ecosystem entirely

Neither is acceptable for a public extension surface.

## Decision Summary

The ASR provider platform will adopt a one-shot-first model with optional streaming extensions.

The design introduces two provider layers:

1. `ASRProvider`
2. `StreamingASRProvider extends ASRProvider`

The contract rules are:

- `recognize()` is required for every ASR provider
- `transcribe()` is optional and only exists on providers with real streaming support
- descriptors explicitly declare capabilities
- the platform may derive `recognize()` from `transcribe()` with an official fallback
- the platform must not derive `transcribe()` from `recognize()` as a default compatibility layer

This makes batch-only providers fully valid while preserving native support for progressive transcription.

## Design Principles

### 1. Real Capability First

The platform must represent what a provider actually supports.

It must not require a provider to simulate streaming just to satisfy a contract. Third-party contributors should be able to implement only the capabilities their upstream API genuinely offers.

### 2. One-Shot Is the Default Application Path

The main app workflow today is post-recording batch transcription. The default ASR entry point should match that dominant product path.

### 3. Streaming Is an Enhancement

Streaming is valuable for future realtime UX, but it is not the minimum bar for participating in the provider ecosystem.

### 4. Open Contract, Internal Helpers

The public contract should accept general audio payloads. Internal platform helpers can still normalize captured audio into PCM or other provider-ready forms, but those helpers must not become the public interface that contributors are forced to adopt.

## Interface Design

### Base Provider Contract

Every provider must implement:

```ts
interface ASRProvider extends Partial<Disposable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  recognize(input: RecognitionInput, options?: RecognitionOptions): Promise<RecognitionResult>
}
```

`recognize()` means:

- accept one complete audio payload plus format metadata
- return one normalized final transcription result

This is the default entry point for application code.

### Streaming Extension Contract

Providers with real progressive output may implement:

```ts
interface StreamingASRProvider extends ASRProvider {
  transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent>
}
```

`transcribe()` means:

- consume audio input in a way compatible with provider-native streaming behavior
- emit normalized transcription events as recognition progresses
- only exist when the provider truly supports streaming semantics

`transcribe()` is not optional on the interface by using `?`. It belongs on a distinct extension interface so the type system clearly separates required behavior from capability-based behavior.

## Input Model

The public ASR contract should accept a general audio payload description rather than assuming every provider works best with raw PCM chunks.

Recommended shape:

```ts
interface RecognitionInput {
  audio: Uint8Array | Uint8Array[] | AsyncIterable<Uint8Array>
  mimeType?: string
  encoding?: 'linear16' | 'pcm_f32le' | 'wav' | 'mp3' | 'ogg' | string
  sampleRate?: number
  channels?: number
}
```

Recommended options shape:

```ts
interface RecognitionOptions {
  language?: string
  signal?: AbortSignal
}
```

### Input Rules

- `audio` carries the raw bytes or byte stream
- `mimeType` and `encoding` give providers enough context to interpret the payload
- `sampleRate` and `channels` are optional because some formats self-describe while raw PCM needs explicit metadata
- providers may validate stricter requirements and reject unsupported combinations

### Why This Shape

This keeps the public platform honest for third-party integrations:

- file-upload providers can accept complete encoded audio
- PCM-based streaming providers can still consume raw chunks
- platform helpers can normalize desktop recordings without forcing external contributors to think in the same internal representation

The design intentionally does not create separate public contracts for file-based and PCM-based providers. One general input shape is easier to document and easier to evolve.

## Result Model

The final recognition result should be structured enough for product and debug use without burdening contributors with too much required mapping.

Recommended shape:

```ts
interface RecognitionResult {
  text: string
  segments: TranscriptionSegment[]
  language?: string
  durationMs?: number
  usage?: Record<string, number>
  rawSummary?: Record<string, unknown>
}
```

### Required Fields

- `text`
- `segments`

### Optional Fields

- `language`
- `durationMs`
- `usage`
- `rawSummary`

### Result Semantics

- `text` is the canonical final transcript
- `segments` is the normalized structural representation of the transcript
- optional fields exist only when a provider can supply them with reasonable fidelity

The platform should not force every provider to synthesize metadata it does not naturally have.

## Segment Model

The existing segment shape remains valid as the normalized unit:

```ts
interface TranscriptionSegment {
  text: string
  startTime?: number
  endTime?: number
  isFinal: boolean
}
```

For final `RecognitionResult`, `segments` should usually contain final segments. Providers may use their native best effort when the upstream API does not expose timing boundaries cleanly.

## Streaming Event Model

Streaming output should use explicit event types instead of overloading one segment type with partial semantic meaning.

Recommended shape:

```ts
interface TranscriptionEvent {
  type: 'interim' | 'final'
  segment: TranscriptionSegment
}
```

### Event Semantics

- `interim` means the event is provisional and may be superseded
- `final` means the event is stable and contributes to the final transcript

The event stream should not introduce additional `done` or `error` events:

- normal completion is represented by iterator completion
- failures are represented by thrown errors

This keeps streaming semantics aligned with standard async iteration and avoids a duplicated completion model.

## Capability Model

ASR descriptors should declare capabilities explicitly.

Recommended shape:

```ts
interface ASRCapabilities {
  nonStreaming: boolean
  streaming: boolean
}
```

Descriptor shape:

```ts
interface ASRProviderDescriptor<TConfig = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  kind: 'cloud' | 'local'
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<ASRCapabilities>
  connectionOptions?: ProviderConnectionOption[]
  create(config: TConfig): ASRProvider | StreamingASRProvider
}
```

### Capability Rules

- all compliant providers effectively support `nonStreaming: true`
- `streaming: true` is only declared when the provider implements real progressive output
- the platform and UI should treat capability metadata as the source of truth for feature availability
- structural checks such as `'transcribe' in provider` remain useful as runtime guards, but they do not replace capability declarations

Default descriptor behavior should be:

- `nonStreaming` defaults to `true`
- `streaming` defaults to `false`
- providers only need to override defaults when they truly support streaming

## Fallback Strategy

The platform should provide one official fallback helper:

```ts
function recognizeFromTranscribe(
  transcribe: (
    input: RecognitionInput,
    options?: RecognitionOptions
  ) => AsyncIterable<TranscriptionEvent>
): (input: RecognitionInput, options?: RecognitionOptions) => Promise<RecognitionResult>
```

### Fallback Behavior

The helper should:

- consume all streamed events
- collect final segments in order
- build `text` from final segments
- return a normalized `RecognitionResult`
- rethrow streaming errors without masking them

### Platform Rule

This fallback is allowed because it preserves truth:

- a streaming provider really does support progressive output
- a final result can honestly be derived from that real stream

The reverse direction is intentionally disallowed as a default platform abstraction.

### Explicit Non-Goal

The platform must not provide a default `transcribeFromRecognize()` helper that makes batch-only providers look streaming-capable.

That would create misleading behavior for:

- realtime UI
- latency expectations
- provider documentation
- third-party contributor understanding

If a future product need requires a one-off adapter for a specific app surface, that adapter should live in application code and must not redefine the public provider contract.

## Registry Behavior

The ASR registry should remain simple and should not invent provider capabilities.

Recommended additions:

- preserve the existing descriptor registration and instance caching behavior
- add helper type guards such as `isStreaming(provider): provider is StreamingASRProvider`
- expose descriptor capabilities to downstream UI and runtime selection logic

The registry should not:

- synthesize `transcribe()` for non-streaming providers
- override declared capabilities
- hide whether a provider is batch-only or dual-mode

## Application Behavior

### Default Application Path

The desktop post-recording pipeline should call `recognize()` directly.

That keeps application code aligned with the actual product workflow:

- capture one finished recording
- normalize audio as needed
- call `recognize()`
- use `RecognitionResult.text` and `RecognitionResult.segments`

### Future Realtime Path

If the app later adds realtime transcription:

- first inspect descriptor capabilities
- only enable realtime paths for providers with `streaming: true`
- then resolve the provider and use `transcribe()` through the streaming extension interface

This avoids building app features on top of fake or inferred streaming support.

## Error Handling

Error behavior should stay conventional and predictable.

### `recognize()`

- rejects on provider errors
- rejects on unsupported input formats
- rejects when configuration is invalid or missing

### `transcribe()`

- throws through the async iterator when streaming fails
- ends normally when transcription completes

The platform should continue using normalized provider error types where appropriate, but it should not hide the distinction between configuration problems and recognition failures.

## Migration Plan

The change should be implemented as a deliberate contract migration rather than as a compatibility layer that preserves the old streaming-first mental model.

### Phase 1: Contract Introduction

- add `RecognitionInput`
- add `RecognitionOptions`
- add `RecognitionResult`
- add `TranscriptionEvent`
- add `ASRCapabilities`
- redefine `ASRProvider` around `recognize()`
- introduce `StreamingASRProvider`

### Phase 2: Built-In Provider Migration

- update Deepgram to implement `recognize()` and `transcribe()`
- allow Deepgram `recognize()` to use native non-streaming behavior if available, otherwise the official fallback
- update Sherpa-ONNX to implement at least `recognize()`
- keep `transcribe()` on Sherpa-ONNX only if its behavior is truly progressive enough to justify `streaming: true`

### Phase 3: Application Migration

- change post-recording pipeline code to call `recognize()`
- stop aggregating final transcript text in application code when provider results already include it
- keep stream handling only in features that genuinely need progressive output

### Phase 4: Documentation Migration

- update provider contribution docs to describe `recognize()` as the default required implementation
- document `transcribe()` as an optional enhancement interface
- add capability examples for batch-only and dual-mode providers

## Testing Strategy

The provider platform should gain tests that validate both contract correctness and capability semantics.

### Contract Tests

- batch-only providers can resolve and operate without `transcribe()`
- streaming providers satisfy both interfaces
- `recognize()` returns normalized `text + segments`

### Fallback Tests

- `recognizeFromTranscribe()` aggregates final events into one result
- interim events do not pollute final output
- stream errors propagate unchanged

### Registry Tests

- capability metadata is preserved through registration
- streaming type guards work correctly
- registry does not invent missing methods

### Application Tests

- post-recording pipeline uses `recognize()`
- realtime-only features remain gated on `streaming: true`

## Non-Goals

This design does not attempt to solve:

- realtime renderer transport details for streaming events
- diarization-specific schema
- word-level timing schema
- provider-native raw response preservation beyond summary fields
- a generic reverse adapter that simulates streaming from one-shot results

Those concerns can be added later if concrete product needs justify them.

## Outcome

This design makes the ASR provider platform a better public extension surface by aligning the contract with real provider shapes.

The result is a cleaner and more durable model:

- one-shot transcription is the default contract
- streaming is a genuine optional enhancement
- batch-only providers are fully supported
- contributor ergonomics improve because the platform no longer asks providers to pretend
- application code can still grow into realtime features without compromising contract honesty
