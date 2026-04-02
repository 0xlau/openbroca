# ASR Provider Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the ASR provider platform from a streaming-only contract to a one-shot-first contract with optional streaming support, then switch the desktop post-recording pipeline to the new `recognize()` path.

**Architecture:** Introduce the new ASR contract and fallback helper in `@openbroca/providers/asr`, migrate built-in providers to implement their true capabilities, then update desktop runtime code to consume `RecognitionResult` directly instead of aggregating streamed segments in app code. Expose normalized ASR capabilities from descriptors so future UI and realtime features can rely on declared provider behavior.

**Tech Stack:** TypeScript, Vitest, Electron main process, Deepgram SDK, sherpa-onnx-node

---

## File Map

- `packages/providers/src/asr/contracts.ts`
  Defines the public ASR type system: `RecognitionInput`, `RecognitionOptions`, `RecognitionResult`, `TranscriptionEvent`, `ASRCapabilities`, `ASRProvider`, `StreamingASRProvider`, and `recognizeFromTranscribe()`.
- `packages/providers/src/asr/index.ts`
  Re-exports the new ASR contract surface.
- `packages/providers/src/asr/registry.ts`
  Keeps registry behavior simple and adds runtime helpers such as `isStreaming()`.
- `packages/providers/src/asr/__tests__/contracts.test.ts`
  Verifies the fallback helper and capability defaults in isolation.
- `packages/providers/src/asr/__tests__/registry.test.ts`
  Verifies batch-only and streaming provider resolution plus `isLocal()` and `isStreaming()` guards.
- `packages/providers/src/asr/providers/deepgram/provider.ts`
  Implements `recognize()` using Deepgram prerecorded transcription and `transcribe()` using live events.
- `packages/providers/src/asr/providers/deepgram/index.ts`
  Declares Deepgram descriptor capabilities and exports the migrated provider.
- `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`
  Verifies Deepgram descriptor capability metadata.
- `packages/providers/src/asr/providers/deepgram/__tests__/provider.test.ts`
  Verifies Deepgram `recognize()` and `transcribe()` mappings.
- `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`
  Implements `recognize()` through the shared fallback and keeps `transcribe()` for true streaming behavior.
- `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
  Declares Sherpa descriptor capabilities.
- `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
  Verifies Sherpa descriptor capability metadata.
- `packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts`
  Verifies Sherpa `recognize()` and `transcribe()` mappings with mocked native bindings.
- `apps/desktop/src/main/audio-resampler.ts`
  Keeps desktop recording normalization focused on producing ASR-ready PCM plus format metadata for `RecognitionInput`.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Replaces app-side stream aggregation with a direct `recognize()` call and consumes `RecognitionResult`.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Verifies the pipeline calls `recognize()` and persists `text + segments`.
- `apps/desktop/src/main/trpc/routers/providers.ts`
  Exposes normalized ASR capabilities to the renderer.
- `apps/desktop/src/main/__tests__/providers-router.test.ts`
  Verifies `listASR()` returns capability metadata.
- `CLAUDE.md`
  Updates contributor-facing architecture notes so the public ASR contract description matches the new implementation.

### Task 1: Rebuild the ASR Contract Surface

**Files:**
- Create: `packages/providers/src/asr/__tests__/contracts.test.ts`
- Modify: `packages/providers/src/asr/contracts.ts`
- Modify: `packages/providers/src/asr/index.ts`
- Modify: `packages/providers/src/asr/registry.ts`
- Modify: `packages/providers/src/asr/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing contract and registry tests**

Add `packages/providers/src/asr/__tests__/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ASR_CAPABILITIES,
  recognizeFromTranscribe,
  resolveASRCapabilities,
  type RecognitionInput,
  type RecognitionResult,
  type TranscriptionEvent,
} from '../contracts.ts'

describe('resolveASRCapabilities', () => {
  it('defaults to nonStreaming only', () => {
    expect(resolveASRCapabilities()).toEqual(DEFAULT_ASR_CAPABILITIES)
  })

  it('merges descriptor overrides', () => {
    expect(resolveASRCapabilities({ streaming: true })).toEqual({
      nonStreaming: true,
      streaming: true,
    })
  })
})

describe('recognizeFromTranscribe', () => {
  it('builds a final result from final events only', async () => {
    const recognize = recognizeFromTranscribe(async function* (
      _input: RecognitionInput,
    ): AsyncIterable<TranscriptionEvent> {
      yield { type: 'interim', segment: { text: 'send the', isFinal: false } }
      yield { type: 'final', segment: { text: 'send the report', isFinal: true } }
      yield { type: 'interim', segment: { text: 'by', isFinal: false } }
      yield { type: 'final', segment: { text: 'by friday', isFinal: true } }
    })

    const result = await recognize({ audio: new Uint8Array([1, 2]), encoding: 'linear16' })

    expect(result).toEqual<RecognitionResult>({
      text: 'send the report by friday',
      segments: [
        { text: 'send the report', isFinal: true },
        { text: 'by friday', isFinal: true },
      ],
    })
  })
})
```

Extend `packages/providers/src/asr/__tests__/registry.test.ts`:

```ts
import type {
  ASRProvider,
  ASRProviderDescriptor,
  LocalASRProvider,
  RecognitionResult,
  StreamingASRProvider,
} from '../contracts.ts'

function makeBatchProvider(): ASRProvider {
  return {
    id: 'batch',
    displayName: 'Batch ASR',
    isConfigured: () => true,
    recognize: async () =>
      ({
        text: 'hello world',
        segments: [{ text: 'hello world', isFinal: true }],
      }) satisfies RecognitionResult,
  }
}

function makeStreamingProvider(): ASRProvider & StreamingASRProvider {
  return {
    ...makeBatchProvider(),
    id: 'stream',
    displayName: 'Stream ASR',
    async *transcribe() {
      yield { type: 'final', segment: { text: 'hello world', isFinal: true } }
    },
  }
}

it('accepts a batch-only provider without transcribe()', () => {
  const registry = new ASRProviderRegistry()
  registry.register({
    id: 'batch',
    displayName: 'Batch',
    description: '',
    kind: 'cloud',
    configSchema: cloudSchema,
    create: makeBatchProvider,
  } satisfies ASRProviderDescriptor<FakeCloudConfig>)

  const provider = registry.resolve('batch', { apiKey: 'k' })
  expect(registry.isStreaming(provider)).toBe(false)
})

it('returns true for streaming providers', () => {
  const registry = new ASRProviderRegistry()
  registry.register({
    ...makeCloudDescriptor('stream'),
    capabilities: { streaming: true },
    create: makeStreamingProvider,
  })

  const provider = registry.resolve('stream', { apiKey: 'k' })
  expect(registry.isStreaming(provider)).toBe(true)
})
```

- [ ] **Step 2: Run the targeted provider tests and verify they fail**

Run:

```bash
pnpm --filter @openbroca/providers test -- packages/providers/src/asr/__tests__/contracts.test.ts packages/providers/src/asr/__tests__/registry.test.ts
```

Expected:

- `Cannot find module '../contracts.ts'` for the new exports
- type failures or assertion failures because `ASRProvider` still requires `transcribe()`
- `registry.isStreaming` is not defined

- [ ] **Step 3: Implement the new ASR contract, capability defaults, fallback helper, and registry guard**

Update `packages/providers/src/asr/contracts.ts`:

```ts
import type { ConfigSchema, Disposable } from '../shared/types.ts'
import type { ProviderConnectionOption } from '../shared/connection.ts'

export interface TranscriptionSegment {
  text: string
  startTime?: number
  endTime?: number
  isFinal: boolean
}

export interface RecognitionInput {
  audio: Uint8Array | Uint8Array[] | AsyncIterable<Uint8Array>
  mimeType?: string
  encoding?: 'linear16' | 'pcm_f32le' | 'wav' | 'mp3' | 'ogg' | string
  sampleRate?: number
  channels?: number
}

export interface RecognitionOptions {
  language?: string
  signal?: AbortSignal
}

export interface RecognitionResult {
  text: string
  segments: TranscriptionSegment[]
  language?: string
  durationMs?: number
  usage?: Record<string, number>
  rawSummary?: Record<string, unknown>
}

export interface TranscriptionEvent {
  type: 'interim' | 'final'
  segment: TranscriptionSegment
}

export interface ASRCapabilities {
  nonStreaming: boolean
  streaming: boolean
}

export const DEFAULT_ASR_CAPABILITIES: ASRCapabilities = {
  nonStreaming: true,
  streaming: false,
}

export function resolveASRCapabilities(
  capabilities?: Partial<ASRCapabilities>,
): ASRCapabilities {
  return { ...DEFAULT_ASR_CAPABILITIES, ...capabilities }
}

export interface ASRProvider extends Partial<Disposable> {
  readonly id: string
  readonly displayName: string
  isConfigured(): boolean
  recognize(
    input: RecognitionInput,
    options?: RecognitionOptions,
  ): Promise<RecognitionResult>
}

export interface StreamingASRProvider extends ASRProvider {
  transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions,
  ): AsyncIterable<TranscriptionEvent>
}

export function recognizeFromTranscribe(
  transcribe: (
    input: RecognitionInput,
    options?: RecognitionOptions,
  ) => AsyncIterable<TranscriptionEvent>,
) {
  return async (input: RecognitionInput, options?: RecognitionOptions): Promise<RecognitionResult> => {
    const segments: TranscriptionSegment[] = []
    for await (const event of transcribe(input, options)) {
      if (event.type === 'final') {
        segments.push({ ...event.segment, isFinal: true })
      }
    }

    return {
      text: segments.map((segment) => segment.text).join(' ').trim(),
      segments,
    }
  }
}
```

Update `packages/providers/src/asr/registry.ts`:

```ts
import type {
  ASRProvider,
  ASRProviderDescriptor,
  LocalASRProvider,
  StreamingASRProvider,
} from './contracts.ts'

export type AnyASRProvider = ASRProvider | (ASRProvider & LocalASRProvider) | (ASRProvider & StreamingASRProvider)

isStreaming(provider: AnyASRProvider): provider is ASRProvider & StreamingASRProvider {
  return 'transcribe' in provider
}
```

Update `packages/providers/src/asr/index.ts` to export:

```ts
export {
  DEFAULT_ASR_CAPABILITIES,
  recognizeFromTranscribe,
  resolveASRCapabilities,
  type ASRCapabilities,
  type ASRProvider,
  type ASRProviderDescriptor,
  type RecognitionInput,
  type RecognitionOptions,
  type RecognitionResult,
  type StreamingASRProvider,
  type TranscriptionEvent,
  type TranscriptionSegment,
} from './contracts.ts'
```

- [ ] **Step 4: Run the targeted provider tests and verify they pass**

Run:

```bash
pnpm --filter @openbroca/providers test -- packages/providers/src/asr/__tests__/contracts.test.ts packages/providers/src/asr/__tests__/registry.test.ts
```

Expected:

- both files pass
- Vitest reports `2 passed` suites or more depending on local grouping

- [ ] **Step 5: Commit the contract migration foundation**

```bash
git add packages/providers/src/asr/contracts.ts \
  packages/providers/src/asr/index.ts \
  packages/providers/src/asr/registry.ts \
  packages/providers/src/asr/__tests__/contracts.test.ts \
  packages/providers/src/asr/__tests__/registry.test.ts
git commit -m "feat(providers): add one-shot asr contract"
```

### Task 2: Migrate Deepgram to Dual-Mode ASR

**Files:**
- Modify: `packages/providers/src/asr/providers/deepgram/provider.ts`
- Modify: `packages/providers/src/asr/providers/deepgram/index.ts`
- Modify: `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`
- Create: `packages/providers/src/asr/providers/deepgram/__tests__/provider.test.ts`

- [ ] **Step 1: Write Deepgram descriptor and provider tests first**

Add to `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`:

```ts
it('declares streaming support in capabilities', () => {
  expect(deepgramDescriptor.capabilities).toEqual({
    streaming: true,
  })
})
```

Create `packages/providers/src/asr/providers/deepgram/__tests__/provider.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeepgramASRProvider } from '../provider.ts'

const createClient = vi.fn()

vi.mock('@deepgram/sdk', () => ({
  createClient,
}))

describe('DeepgramASRProvider', () => {
  beforeEach(() => {
    createClient.mockReset()
  })

  it('recognize() maps prerecorded results into RecognitionResult', async () => {
    createClient.mockReturnValue({
      listen: {
        prerecorded: {
          transcribeFile: vi.fn().mockResolvedValue({
            result: {
              results: {
                channels: [
                  {
                    alternatives: [
                      {
                        transcript: 'send the report by friday',
                      },
                    ],
                  },
                ],
              },
            },
            error: null,
          }),
        },
      },
    })

    const provider = new DeepgramASRProvider({ apiKey: 'dg-test' })
    const result = await provider.recognize({
      audio: new Uint8Array([1, 2]),
      encoding: 'linear16',
      sampleRate: 16000,
      channels: 1,
    })

    expect(result).toEqual({
      text: 'send the report by friday',
      segments: [{ text: 'send the report by friday', isFinal: true }],
    })
  })

  it('transcribe() yields normalized interim and final events', async () => {
    const handlers = new Map<string, (value: any) => void>()
    createClient.mockReturnValue({
      listen: {
        live: vi.fn(() => ({
          on: (event: string, handler: (value: any) => void) => {
            handlers.set(event, handler)
          },
          send: vi.fn(),
          requestClose: vi.fn(),
        })),
      },
    })

    const provider = new DeepgramASRProvider({ apiKey: 'dg-test' })
    const iterator = provider.transcribe({
      audio: (async function* () {
        yield new Uint8Array([1, 2])
      })(),
      encoding: 'linear16',
      sampleRate: 16000,
      channels: 1,
    })[Symbol.asyncIterator]()

    handlers.get('Results')?.({
      channel: { alternatives: [{ transcript: 'send the' }] },
      is_final: false,
    })
    handlers.get('Results')?.({
      channel: { alternatives: [{ transcript: 'send the report' }] },
      is_final: true,
    })
    handlers.get('close')?.({})

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'interim', segment: { text: 'send the', isFinal: false } },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'final', segment: { text: 'send the report', isFinal: true } },
    })
  })
})
```

- [ ] **Step 2: Run Deepgram tests and verify they fail**

Run:

```bash
pnpm --filter @openbroca/providers test -- packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts packages/providers/src/asr/providers/deepgram/__tests__/provider.test.ts
```

Expected:

- descriptor capability assertion fails
- `recognize()` is missing
- `transcribe()` still yields raw segments instead of event objects

- [ ] **Step 3: Implement Deepgram `recognize()` and event-based `transcribe()`**

Update `packages/providers/src/asr/providers/deepgram/provider.ts`:

```ts
import { createClient } from '@deepgram/sdk'
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import {
  type ASRProvider,
  type RecognitionInput,
  type RecognitionOptions,
  type RecognitionResult,
  type StreamingASRProvider,
  type TranscriptionEvent,
} from '../../contracts.ts'

async function collectAudio(input: RecognitionInput['audio']): Promise<Buffer> {
  if (input instanceof Uint8Array) {
    return Buffer.from(input)
  }
  if (Array.isArray(input)) {
    return Buffer.concat(input.map((chunk) => Buffer.from(chunk)))
  }

  const chunks: Buffer[] = []
  for await (const chunk of input) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export class DeepgramASRProvider implements ASRProvider, StreamingASRProvider {
  readonly id = 'deepgram'
  readonly displayName = 'Deepgram'

  async recognize(
    input: RecognitionInput,
    options?: RecognitionOptions,
  ): Promise<RecognitionResult> {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    const client = createClient(this.apiKey)
    const audio = await collectAudio(input.audio)
    const { result, error } = await client.listen.prerecorded.transcribeFile(audio, {
      model: 'nova-2',
      language: options?.language ?? 'en',
      smart_format: true,
    })

    if (error) {
      throw new TranscriptionError(this.id, error.message)
    }

    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ''

    return {
      text: transcript,
      segments: transcript ? [{ text: transcript, isFinal: true }] : [],
    }
  }

  async *transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions,
  ): AsyncIterable<TranscriptionEvent> {
    for await (const event of this.createLiveEventStream(input, options)) {
      yield event
    }
  }

  private async *createLiveEventStream(
    input: RecognitionInput,
    options?: RecognitionOptions,
  ): AsyncIterable<TranscriptionEvent> {
    const client = createClient(this.apiKey)
    const events: TranscriptionEvent[] = []
    let done = false
    let error: Error | null = null
    let resolve: (() => void) | null = null

    const notify = () => {
      if (resolve) {
        const current = resolve
        resolve = null
        current()
      }
    }

    const connection = client.listen.live({
      model: 'nova-2',
      language: options?.language ?? 'en',
      smart_format: true,
      encoding: 'linear16',
      sample_rate: input.sampleRate ?? 16000,
      interim_results: true,
    })

    connection.on('Results', (data) => {
      const transcript = data.channel.alternatives[0]?.transcript ?? ''
      if (!transcript) return

      events.push({
        type: data.is_final ? 'final' : 'interim',
        segment: {
          text: transcript,
          isFinal: data.is_final,
          startTime: data.start,
          endTime:
            data.start != null && data.duration != null
              ? data.start + data.duration
              : undefined,
        },
      })
      notify()
    })

    connection.on('error', (err: Error) => {
      error = new TranscriptionError(this.id, err.message, err)
      done = true
      notify()
    })

    connection.on('close', () => {
      done = true
      notify()
    })

    const sendAudio = async () => {
      try {
        for await (const chunk of toAsyncChunks(input.audio)) {
          if (options?.signal?.aborted) break
          connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
        }
      } finally {
        connection.requestClose()
      }
    }
    void sendAudio()

    while (!done || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!
        continue
      }
      if (error) throw error
      await new Promise<void>((doneWaiting) => {
        resolve = doneWaiting
      })
    }
    if (error) throw error
  }
}

async function* toAsyncChunks(
  audio: RecognitionInput['audio'],
): AsyncIterable<Uint8Array> {
  if (audio instanceof Uint8Array) {
    yield audio
    return
  }
  if (Array.isArray(audio)) {
    for (const chunk of audio) {
      yield chunk
    }
    return
  }
  for await (const chunk of audio) {
    yield chunk
  }
}
```

Update `packages/providers/src/asr/providers/deepgram/index.ts`:

```ts
export const deepgramDescriptor: ASRProviderDescriptor<DeepgramConfig> = {
  id: 'deepgram',
  displayName: 'Deepgram',
  description: 'Real-time speech recognition via the Deepgram Nova API',
  icon,
  kind: 'cloud',
  capabilities: { streaming: true },
  configSchema,
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      description: 'Enter a Deepgram API key to enable real-time transcription.',
      fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true, description: 'Your Deepgram API key.' }],
    },
  ],
  create: (config) => new DeepgramASRProvider(config),
}
```

When converting live responses, map:

```ts
{
  type: data.is_final ? 'final' : 'interim',
  segment: {
    text: transcript,
    isFinal: data.is_final,
    startTime: data.start,
    endTime: data.start != null && data.duration != null ? data.start + data.duration : undefined,
  },
}
```

- [ ] **Step 4: Run the Deepgram tests and verify they pass**

Run:

```bash
pnpm --filter @openbroca/providers test -- packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts packages/providers/src/asr/providers/deepgram/__tests__/provider.test.ts
```

Expected:

- both descriptor and provider tests pass

- [ ] **Step 5: Commit the Deepgram migration**

```bash
git add packages/providers/src/asr/providers/deepgram/index.ts \
  packages/providers/src/asr/providers/deepgram/provider.ts \
  packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts \
  packages/providers/src/asr/providers/deepgram/__tests__/provider.test.ts
git commit -m "feat(providers): migrate deepgram asr contract"
```

### Task 3: Migrate Sherpa-ONNX to `recognize()` plus Streaming Events

**Files:**
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
- Create: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts`

- [ ] **Step 1: Write Sherpa descriptor and provider tests first**

Add to `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`:

```ts
it('declares streaming support in capabilities', () => {
  expect(sherpaOnnxDescriptor.capabilities).toEqual({
    streaming: true,
  })
})
```

Create `packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SherpaOnnxASRProvider } from '../provider.ts'

const OnlineRecognizer = vi.fn()

vi.mock('sherpa-onnx-node', () => ({
  OnlineRecognizer,
}))

describe('SherpaOnnxASRProvider', () => {
  beforeEach(() => {
    OnlineRecognizer.mockReset()
  })

  it('recognize() aggregates final streaming events through the shared fallback', async () => {
    const stream = {
      acceptWaveform: vi.fn(),
      free: vi.fn(),
    }
    const recognizer = {
      createStream: vi.fn(() => stream),
      isReady: vi.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValue(false),
      decode: vi.fn(),
      getResult: vi.fn()
        .mockReturnValueOnce({ text: 'ni', isEndpoint: false })
        .mockReturnValueOnce({ text: 'ni hao', isEndpoint: true }),
      reset: vi.fn(),
    }
    OnlineRecognizer.mockImplementation(() => recognizer)

    const provider = new SherpaOnnxASRProvider({ modelDir: '/tmp/models' })
    vi.spyOn(provider as any, 'assertModelDir').mockReturnValue('/tmp/models')

    const result = await provider.recognize({
      audio: [new Uint8Array(new Int16Array([1, 2, 3]).buffer)],
      encoding: 'linear16',
      sampleRate: 16000,
      channels: 1,
    })

    expect(result).toEqual({
      text: 'ni hao',
      segments: [{ text: 'ni hao', isFinal: true }],
    })
  })

  it('transcribe() yields interim and final events from the online recognizer', async () => {
    const stream = {
      acceptWaveform: vi.fn(),
      free: vi.fn(),
    }
    const recognizer = {
      createStream: vi.fn(() => stream),
      isReady: vi.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValue(false),
      decode: vi.fn(),
      getResult: vi.fn()
        .mockReturnValueOnce({ text: 'ni', isEndpoint: false })
        .mockReturnValueOnce({ text: 'ni hao', isEndpoint: true }),
      reset: vi.fn(),
    }
    OnlineRecognizer.mockImplementation(() => recognizer)

    const provider = new SherpaOnnxASRProvider({ modelDir: '/tmp/models' })
    vi.spyOn(provider as any, 'assertModelDir').mockReturnValue('/tmp/models')

    const events: Array<{ type: string; segment: { text: string; isFinal: boolean } }> = []
    for await (const event of provider.transcribe({
      audio: [new Uint8Array(new Int16Array([1, 2, 3]).buffer)],
      encoding: 'linear16',
      sampleRate: 16000,
      channels: 1,
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'interim', segment: { text: 'ni', isFinal: false } },
      { type: 'final', segment: { text: 'ni hao', isFinal: true } },
    ])
  })
})
```

- [ ] **Step 2: Run Sherpa tests and verify they fail**

Run:

```bash
pnpm --filter @openbroca/providers test -- packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts
```

Expected:

- descriptor capability assertion fails
- `recognize()` is missing
- `transcribe()` still yields raw segments instead of event objects

- [ ] **Step 3: Implement Sherpa `recognize()` with the shared fallback and convert `transcribe()` to event output**

Update `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`:

```ts
import type {
  LocalASRProvider,
  RecognitionInput,
  RecognitionOptions,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent,
} from '../../contracts.ts'
import { recognizeFromTranscribe } from '../../contracts.ts'

export class SherpaOnnxASRProvider implements LocalASRProvider, StreamingASRProvider {
  recognize = recognizeFromTranscribe((input, options) => this.transcribe(input, options))

  async *transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions,
  ): AsyncIterable<TranscriptionEvent> {
    if (!this.isConfigured()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    const sherpa = await import('sherpa-onnx-node').catch(() => {
      throw new TranscriptionError(
        this.id,
        'sherpa-onnx-node native module is not available on this platform',
      )
    })

    const modelDir = this.assertModelDir()
    const downloadedModel = MODEL_MANIFEST.find((model) =>
      fs.existsSync(path.join(modelDir, model.subDir)),
    )
    if (!downloadedModel) {
      throw new TranscriptionError(this.id, 'No models downloaded. Call downloadModel() first.')
    }

    const modelPath = path.join(modelDir, downloadedModel.subDir)
    const recognizerConfig = buildRecognizerConfig(
      modelPath,
      downloadedModel.id,
      options?.language,
    )
    const recognizer = new sherpa.OnlineRecognizer(recognizerConfig)
    const stream = recognizer.createStream()

    try {
      for await (const chunk of toAsyncChunks(input.audio)) {
        if (options?.signal?.aborted) break
        const samples = int16ToFloat32(chunk)
        stream.acceptWaveform({ sampleRate: input.sampleRate ?? 16000, samples })

        while (recognizer.isReady(stream)) {
          recognizer.decode(stream)
          const result: { text: string; isEndpoint: boolean } = recognizer.getResult(stream)
          if (!result.text) continue

          const isFinal = result.isEndpoint
          yield {
            type: isFinal ? 'final' : 'interim',
            segment: { text: result.text, isFinal },
          }

          if (isFinal) {
            recognizer.reset(stream)
          }
        }
      }
    } finally {
      stream.free()
    }
  }
}

async function* toAsyncChunks(
  audio: RecognitionInput['audio'],
): AsyncIterable<Uint8Array> {
  if (audio instanceof Uint8Array) {
    yield audio
    return
  }
  if (Array.isArray(audio)) {
    for (const chunk of audio) {
      yield chunk
    }
    return
  }
  for await (const chunk of audio) {
    yield chunk
  }
}
```

Update `packages/providers/src/asr/providers/sherpa-onnx/index.ts`:

```ts
export const sherpaOnnxDescriptor: ASRProviderDescriptor<SherpaOnnxConfig> = {
  id: 'sherpa-onnx',
  displayName: '@k2-fsa/sherpa-onnx',
  description: 'On-device speech recognition powered by sherpa-onnx — no internet required',
  icon,
  kind: 'local',
  capabilities: { streaming: true },
  configSchema,
  connectionOptions: [
    {
      type: 'local',
      label: 'Local Model Path',
      description: 'Point OpenBroca at a sherpa-onnx model directory on this machine.',
      fields: [{ key: 'modelDir', label: 'Model Directory', input: 'directory', required: true, description: 'Absolute path to the local sherpa-onnx model directory.' }],
    },
  ],
  create: (config) => new SherpaOnnxASRProvider(config),
}
```

- [ ] **Step 4: Run Sherpa tests and verify they pass**

Run:

```bash
pnpm --filter @openbroca/providers test -- packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts
```

Expected:

- both descriptor and provider tests pass

- [ ] **Step 5: Commit the Sherpa migration**

```bash
git add packages/providers/src/asr/providers/sherpa-onnx/index.ts \
  packages/providers/src/asr/providers/sherpa-onnx/provider.ts \
  packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts \
  packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts
git commit -m "feat(providers): migrate sherpa asr contract"
```

### Task 4: Switch the Desktop Voice Pipeline to `recognize()`

**Files:**
- Modify: `apps/desktop/src/main/audio-resampler.ts`
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Write failing desktop pipeline tests for `recognize()`**

Update `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts` by replacing ASR mocks with `recognize()` and adding an input-shape assertion:

```ts
const asrProvider = {
  id: 'deepgram',
  displayName: 'Deepgram',
  isConfigured: () => true,
  recognize: vi.fn().mockResolvedValue({
    text: 'send the report by friday',
    segments: [{ text: 'send the report by friday', isFinal: true }],
  }),
}

expect(asrProvider.recognize).toHaveBeenCalledWith(
  expect.objectContaining({
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1,
  }),
  { language: 'en' },
)
```

Add a failure-preservation assertion:

```ts
const asrProvider = {
  id: 'deepgram',
  displayName: 'Deepgram',
  isConfigured: () => true,
  recognize: vi.fn().mockRejectedValue(new Error('asr timeout')),
}

expect(repository.update).toHaveBeenLastCalledWith(
  'record-4',
  expect.objectContaining({
    status: 'failed',
    failureStage: 'asr',
    debug: expect.objectContaining({
      rawTranscriptionText: '',
      asrSegments: [],
    }),
  }),
)
```

- [ ] **Step 2: Run the desktop pipeline tests and verify they fail**

Run:

```bash
pnpm --filter desktop test -- apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected:

- tests fail because `post-recording-pipeline.ts` still calls `transcribe()`

- [ ] **Step 3: Implement a `RecognitionInput` builder and switch the pipeline to provider results**

Update `apps/desktop/src/main/audio-resampler.ts`:

```ts
import type { RecognitionInput } from '@openbroca/providers/asr'

export function buildRecognitionInput(recording: {
  format: AudioFormat
  chunks: Uint8Array[]
}): RecognitionInput {
  const normalizedChunks = normalizeRecordingForASR(recording)
  return {
    audio: normalizedChunks,
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1,
  }
}
```

Update `apps/desktop/src/main/post-recording-pipeline.ts`:

```ts
import type { RecognitionResult } from '@openbroca/providers/asr'
import { buildRecognitionInput } from './audio-resampler'

const asrRequest = { language: 'en' }
let asrResult: RecognitionResult = { text: '', segments: [] }

try {
  const recognitionInput = buildRecognitionInput(recording)
  asrResult = await asrProvider.recognize(recognitionInput, asrRequest)
  rawTranscriptionText = asrResult.text
  asrSegments.push(...asrResult.segments)

  this.deps.historyRepository.update(record.id, {
    debug: {
      rawTranscriptionText,
      asrSegments,
      asrRequest,
      asrResponseSummary: { segmentCount: asrSegments.length },
      timeline: [...timeline],
    },
  })
} catch (error) {
  rawTranscriptionText = asrResult.text
  const message = error instanceof Error ? error.message : String(error)
  errors.push({ stage: 'asr', message, at: now() })
  pushTimeline('asr', 'failed', message)
  this.deps.historyRepository.update(record.id, {
    status: 'failed',
    failureStage: 'asr',
    failureMessage: message,
    debug: {
      rawTranscriptionText,
      asrSegments,
      asrRequest,
      asrResponseSummary: { segmentCount: asrSegments.length },
      errors: [...errors],
      timeline: [...timeline],
    },
  })
  return
}
```

Delete the no-longer-needed helper and loop:

```ts
function toAsyncIterable(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {}
function buildFinalTranscript(segments: TranscriptionSegment[]): string {}
```

- [ ] **Step 4: Run the desktop pipeline tests and verify they pass**

Run:

```bash
pnpm --filter desktop test -- apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected:

- pipeline tests pass with `recognize()` mocks

- [ ] **Step 5: Commit the desktop pipeline migration**

```bash
git add apps/desktop/src/main/audio-resampler.ts \
  apps/desktop/src/main/post-recording-pipeline.ts \
  apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
git commit -m "feat(desktop): use asr recognize in voice pipeline"
```

### Task 5: Expose ASR Capabilities to the App and Sync Contributor Docs

**Files:**
- Modify: `apps/desktop/src/main/trpc/routers/providers.ts`
- Modify: `apps/desktop/src/main/__tests__/providers-router.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the failing router test for ASR capabilities**

Extend `apps/desktop/src/main/__tests__/providers-router.test.ts`:

```ts
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'

test('listASR returns normalized capabilities', async () => {
  const store = new MemoryStore()
  const asrRegistry = new ASRProviderRegistry()
  asrRegistry.register(deepgramDescriptor)

  const caller = providersRouter.createCaller({
    store,
    asrRegistry,
    llmRegistry: new LLMProviderRegistry(),
    oauthService: {
      getRuntimeConfig: vi.fn(),
    },
  } as unknown as Context)

  const providers = await caller.listASR()
  expect(providers).toContainEqual(
    expect.objectContaining({
      id: 'deepgram',
      capabilities: {
        nonStreaming: true,
        streaming: true,
      },
    }),
  )
})
```

- [ ] **Step 2: Run the router test and verify it fails**

Run:

```bash
pnpm --filter desktop test -- apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected:

- `listASR()` does not include `capabilities`

- [ ] **Step 3: Implement capability exposure and sync the contributor docs**

Update `apps/desktop/src/main/trpc/routers/providers.ts`:

```ts
import { resolveASRCapabilities } from '@openbroca/providers/asr'

listASR: publicProcedure.query(({ ctx }) => {
  return ctx.asrRegistry.listDescriptors().map((d) => ({
    id: d.id,
    displayName: d.displayName,
    description: d.description,
    icon: d.icon ?? null,
    kind: d.kind,
    capabilities: resolveASRCapabilities(d.capabilities),
    connectionOptions: d.connectionOptions ?? [],
  }))
})
```

Update the ASR section in `CLAUDE.md`:

```md
- `@openbroca/providers/asr` — `ASRProvider`, `StreamingASRProvider`, `LocalASRProvider`, `ASRProviderDescriptor`, `ASRProviderRegistry`

**`LocalASRProvider`** adds model management on top of the base `recognize()`: `listModels()`, `downloadModel(id, signal?)` returning `AsyncIterable<DownloadProgress>`, and `deleteModel(id)`. Providers that support realtime output also implement `transcribe()` through the `StreamingASRProvider` extension interface. The public ASR contract accepts general audio payloads through `RecognitionInput`.
```

- [ ] **Step 4: Run the router test and provider package tests, then verify they pass**

Run:

```bash
pnpm --filter desktop test -- apps/desktop/src/main/__tests__/providers-router.test.ts
pnpm --filter @openbroca/providers typecheck
pnpm --filter desktop test -- apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected:

- all targeted tests pass
- provider package typecheck passes with no TypeScript errors

- [ ] **Step 5: Commit capability exposure and docs sync**

```bash
git add apps/desktop/src/main/trpc/routers/providers.ts \
  apps/desktop/src/main/__tests__/providers-router.test.ts \
  CLAUDE.md
git commit -m "feat(desktop): expose asr provider capabilities"
```

## Self-Review

### Spec Coverage

- Contract migration: Task 1
- Deepgram dual-mode implementation: Task 2
- Sherpa dual-mode implementation: Task 3
- Desktop `recognize()` migration: Task 4
- Capability exposure for app/runtime and contributor docs: Task 5

No spec section is currently unassigned.

### Placeholder Scan

- No `TODO`, `TBD`, or deferred “implement later” steps remain
- Each test step has an exact file and concrete code
- Each verification step has an exact command
- Each commit step has an exact Conventional Commit message

### Type Consistency

- Public contract names are consistent across tasks: `RecognitionInput`, `RecognitionOptions`, `RecognitionResult`, `TranscriptionEvent`, `StreamingASRProvider`, `resolveASRCapabilities`
- Desktop migration consistently uses `recognize()` instead of mixing `transcribe()` back into the one-shot path
- Router capability exposure uses the same defaulting helper introduced in Task 1
