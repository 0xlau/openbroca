# Provider Utility Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all ASR and LLM provider execution out of the Electron main process into a dedicated `utilityProcess` so heavy CPU work (sherpa-onnx native inference, JS audio resampling) and network I/O no longer block the UI event loop. Symptom to fix: window freezes / `CGEventTap timeout` during the post-recording pipeline.

**Architecture:** A single Electron `utilityProcess` ("provider host") spawned at app startup hosts both `LLMProviderRegistry` and `ASRProviderRegistry`. The main process keeps the same `ASRProvider` / `LLMProvider` interface surface via thin **remote proxies** that forward every method call across `MessagePortMain`. Callers (`PostRecordingPipeline`, `local-models`, tRPC routers) are unchanged because the proxies satisfy the existing contracts. AbortSignal, async iterables, and `ProviderError` subclass identity are all preserved across the boundary.

**Tech Stack:** Electron `utilityProcess`, `MessageChannelMain` / `MessagePortMain`, structured-clone IPC with correlation IDs, vitest, existing `@openbroca/providers` package.

---

## Design Decisions (locked in before tasks)

1. **Single utility process, not per-provider.** All providers share one child. Cheaper startup, simpler lifecycle.
2. **Single `MessagePortMain` channel** between main and child, multiplexed via correlation IDs (`reqId`). Each in-flight call has a unique id; cancellation, stream-yields, and stream-end frames all reference it.
3. **Provider instances are created lazily on first use** via `createInstance` RPC and identified by an opaque `instanceId` returned to main. The child caches instances keyed by `(kind, providerId, stableConfigKey)` so repeat resolutions reuse the same instance — preserves today's registry caching semantics.
4. **`AbortSignal` is bridged**, not transferred. Main proxies attach an `abort` listener to the caller's signal; on abort they send `{ kind: 'cancel', reqId }`. The child holds an `AbortController` per in-flight call and aborts it.
5. **Errors are serialized with class hint.** `{ name, message, providerId, cause }`. Main re-hydrates `ProviderError`, `ConfigurationError`, `TranscriptionError` based on `name`. Other errors become plain `Error` with a `.cause` containing the serialized form.
6. **Async iterables cross the wire** via `streamYield` / `streamEnd` / `streamError` frames. Backpressure is not implemented (YAGNI for current call sizes).
7. **Audio buffers are passed through structured clone** as `Uint8Array | Uint8Array[]`. We do not optimize with transferList yet — current recording sizes are <1 MB and copy cost is sub-millisecond. Optimization is a follow-up.
8. **Descriptors stay in main.** The main-side registries continue to hold descriptors for UI metadata (display name, config schema, capabilities, `getSetupStatus`). The child has its own copy of the registries solely for `descriptor.create(config)` runtime construction. Both processes import the same `@openbroca/providers` modules.
9. **Crash policy: fail loudly, no auto-restart in v1.** If the child exits unexpectedly, all in-flight calls reject with `ProviderError('utility-process', 'Provider host crashed')`. Auto-restart is a follow-up (YAGNI now — log it, surface it).
10. **No new public package APIs.** Everything new lives under `apps/desktop/src/main/provider-host/`. The `@openbroca/providers` package is unchanged.

### Layout

```
apps/desktop/src/main/provider-host/
  protocol.ts            ← message types, error serialization, stableConfigKey
  abort-bridge.ts        ← signal ↔ reqId helpers (main side & child side share via shared/)
  host.ts                ← main-side: spawn utilityProcess, send/recv, instance map
  remote-asr-proxy.ts    ← implements LocalASRProvider & StreamingASRProvider
  remote-llm-proxy.ts    ← implements LLMProvider
  child/
    index.ts             ← utilityProcess entry: receives port, dispatches calls
    registries.ts        ← child-side registry construction (mirrors providers/index.ts)
  __tests__/
    protocol.test.ts
    host-integration.test.ts
```

`runtime.ts` is updated so `resolveActiveASRSelection` / `resolveLLMProvider` return remote proxies sourced from a singleton `ProviderHost`.

---

## Task 1: Define the wire protocol & error serialization

**Files:**
- Create: `apps/desktop/src/main/provider-host/protocol.ts`
- Create: `apps/desktop/src/main/provider-host/__tests__/protocol.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/main/provider-host/__tests__/protocol.test.ts
import { describe, expect, it } from 'vitest'
import { ConfigurationError, ProviderError, TranscriptionError } from '@openbroca/providers'
import { deserializeError, serializeError, stableConfigKey } from '../protocol'

describe('protocol', () => {
  describe('serializeError / deserializeError', () => {
    it('round-trips ProviderError with cause', () => {
      const cause = new Error('underlying')
      const original = new ProviderError('sherpa-onnx', 'native crash', cause)
      const restored = deserializeError(serializeError(original))
      expect(restored).toBeInstanceOf(ProviderError)
      expect(restored.message).toBe('native crash')
      expect((restored as ProviderError).providerId).toBe('sherpa-onnx')
    })

    it('round-trips ConfigurationError', () => {
      const restored = deserializeError(
        serializeError(new ConfigurationError('openai', 'missing key'))
      )
      expect(restored).toBeInstanceOf(ConfigurationError)
      expect(restored).toBeInstanceOf(ProviderError)
    })

    it('round-trips TranscriptionError', () => {
      const restored = deserializeError(
        serializeError(new TranscriptionError('deepgram', 'bad audio'))
      )
      expect(restored).toBeInstanceOf(TranscriptionError)
    })

    it('falls back to plain Error for unknown classes', () => {
      const restored = deserializeError(serializeError(new RangeError('out of range')))
      expect(restored).toBeInstanceOf(Error)
      expect(restored.message).toBe('out of range')
    })
  })

  describe('stableConfigKey', () => {
    it('produces equal keys for objects with reordered keys', () => {
      expect(stableConfigKey({ a: 1, b: 2 })).toBe(stableConfigKey({ b: 2, a: 1 }))
    })

    it('differs for different values', () => {
      expect(stableConfigKey({ apiKey: 'x' })).not.toBe(stableConfigKey({ apiKey: 'y' }))
    })

    it('handles nested objects and arrays', () => {
      const a = stableConfigKey({ models: [{ id: 'a' }, { id: 'b' }], opts: { x: 1 } })
      const b = stableConfigKey({ opts: { x: 1 }, models: [{ id: 'a' }, { id: 'b' }] })
      expect(a).toBe(b)
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter desktop exec vitest run src/main/provider-host/__tests__/protocol.test.ts
```

Expected: FAIL — `Cannot find module '../protocol'`.

- [ ] **Step 3: Implement protocol.ts**

```ts
// apps/desktop/src/main/provider-host/protocol.ts
import { ConfigurationError, ProviderError, TranscriptionError } from '@openbroca/providers'

export type ProviderKind = 'asr' | 'llm'

export interface SerializedError {
  name: string
  message: string
  providerId?: string
  stack?: string
  cause?: SerializedError
}

export type ChildRequest =
  | {
      kind: 'create-instance'
      reqId: string
      providerKind: ProviderKind
      providerId: string
      configKey: string
      config: unknown
    }
  | { kind: 'invoke'; reqId: string; instanceId: string; method: string; args: unknown[] }
  | { kind: 'invoke-stream'; reqId: string; instanceId: string; method: string; args: unknown[] }
  | { kind: 'cancel'; reqId: string }
  | { kind: 'dispose-instance'; reqId: string; instanceId: string }

export type ChildResponse =
  | { kind: 'instance'; reqId: string; instanceId: string }
  | { kind: 'result'; reqId: string; value: unknown }
  | { kind: 'error'; reqId: string; error: SerializedError }
  | { kind: 'stream-yield'; reqId: string; value: unknown }
  | { kind: 'stream-end'; reqId: string }
  | { kind: 'stream-error'; reqId: string; error: SerializedError }
  | { kind: 'ready' }

export function serializeError(error: unknown): SerializedError {
  if (error instanceof ProviderError) {
    return {
      name: error.constructor.name,
      message: error.message,
      providerId: error.providerId,
      stack: error.stack,
      cause: error.cause !== undefined ? serializeError(error.cause) : undefined
    }
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause !== undefined ? serializeError(error.cause) : undefined
    }
  }
  return { name: 'Error', message: typeof error === 'string' ? error : 'Unknown error' }
}

export function deserializeError(serialized: SerializedError): Error {
  const cause = serialized.cause ? deserializeError(serialized.cause) : undefined
  const providerId = serialized.providerId ?? 'unknown'
  let error: Error
  switch (serialized.name) {
    case 'ConfigurationError':
      error = new ConfigurationError(providerId, serialized.message)
      break
    case 'TranscriptionError':
      error = new TranscriptionError(providerId, serialized.message, cause)
      break
    case 'ProviderError':
      error = new ProviderError(providerId, serialized.message, cause)
      break
    default:
      error = new Error(serialized.message)
      if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause
      break
  }
  if (serialized.stack) error.stack = serialized.stack
  return error
}

export function stableConfigKey(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return entries.map(([k, v]) => [k, canonicalize(v)])
  }
  return value
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter desktop exec vitest run src/main/provider-host/__tests__/protocol.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/provider-host/protocol.ts apps/desktop/src/main/provider-host/__tests__/protocol.test.ts
git commit -m "feat(provider-host): wire protocol types and error serialization"
```

---

## Task 2: Build child-side bootstrap (utility process entry)

**Files:**
- Create: `apps/desktop/src/main/provider-host/child/registries.ts`
- Create: `apps/desktop/src/main/provider-host/child/index.ts`

**Background:** This is the script the utility process runs. It receives a `MessagePortMain` from main, creates child-side registries by mirroring `apps/desktop/src/main/providers/index.ts`, then enters a dispatch loop. On `create-instance`, it calls `descriptor.create(config)` and stores the result in a Map keyed by an opaque instanceId (UUID). On `invoke` / `invoke-stream`, it dispatches `provider[method](...args)`, awaiting promises or iterating async iterables and streaming back chunks. On `cancel`, it aborts the matching `AbortController` whose signal was injected into the relevant args.

**AbortSignal injection rule:** When unmarshalling `args`, the child looks for any arg of shape `{ __signalSlot: true }` and replaces it with the per-call `AbortController.signal`. The proxy on the main side replaces `AbortSignal` instances in args with this sentinel before sending. (One signal slot per call is sufficient — `recognize`, `generate`, `installModel` all take at most one signal.)

- [ ] **Step 1: Implement child-side registries**

```ts
// apps/desktop/src/main/provider-host/child/registries.ts
import { ASRProviderRegistry, type AnyASRProvider } from '@openbroca/providers/asr'
import { LLMProviderRegistry, type LLMProvider } from '@openbroca/providers/llm'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { createSherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'

export interface ChildRegistries {
  asr: ASRProviderRegistry
  llm: LLMProviderRegistry
}

export interface ChildRegistryOptions {
  defaultModelDir: string
}

export function createChildRegistries(opts: ChildRegistryOptions): ChildRegistries {
  const llm = new LLMProviderRegistry()
  llm.register(openaiDescriptor)
  llm.register(openaiCodexDescriptor)
  llm.register(openrouterDescriptor)

  const asr = new ASRProviderRegistry()
  asr.register(deepgramDescriptor)
  asr.register(createSherpaOnnxDescriptor({ defaultModelDir: opts.defaultModelDir }))

  return { asr, llm }
}

export type AnyProvider = AnyASRProvider | LLMProvider
```

> **Note:** Confirm the exact list of LLM descriptors during execution by reading `apps/desktop/src/main/providers/index.ts`. The list above must match it 1:1. If `openai-codex` or `openrouter` paths differ from the package exports, adjust the imports accordingly.

- [ ] **Step 2: Implement child entry**

```ts
// apps/desktop/src/main/provider-host/child/index.ts
import { randomUUID } from 'node:crypto'
import { parentPort } from 'node:worker_threads'
// utilityProcess uses process.parentPort, not worker_threads parentPort.
// Keep the import only as a type fallback; runtime uses process.parentPort.
import {
  type ChildRequest,
  type ChildResponse,
  serializeError
} from '../protocol'
import { createChildRegistries, type ChildRegistries } from './registries'

interface InvocationHandle {
  controller: AbortController
}

interface InstanceEntry {
  providerKind: 'asr' | 'llm'
  providerId: string
  configKey: string
  provider: object
}

const instances = new Map<string, InstanceEntry>()
const instancesByConfig = new Map<string, string>() // key = `${kind}:${providerId}:${configKey}`
const inflight = new Map<string, InvocationHandle>()
let registries: ChildRegistries | null = null

function send(message: ChildResponse): void {
  // utilityProcess: process.parentPort is the MessagePortMain
  ;(process as unknown as { parentPort: { postMessage: (msg: ChildResponse) => void } })
    .parentPort.postMessage(message)
}

const SIGNAL_SLOT_MARKER = '__signalSlot' as const

function injectSignal(args: unknown[], signal: AbortSignal): unknown[] {
  return args.map((arg) => {
    if (arg && typeof arg === 'object' && (arg as Record<string, unknown>)[SIGNAL_SLOT_MARKER]) {
      return signal
    }
    if (arg && typeof arg === 'object') {
      // Walk one level deep — `recognize(input, options)` and `generate(request)`
      // both place the signal inside an options/request object.
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
        if (v && typeof v === 'object' && (v as Record<string, unknown>)[SIGNAL_SLOT_MARKER]) {
          out[k] = signal
        } else {
          out[k] = v
        }
      }
      return out
    }
    return arg
  })
}

async function handle(req: ChildRequest): Promise<void> {
  if (!registries) {
    return send({ kind: 'error', reqId: 'reqId' in req ? req.reqId : '', error: serializeError(new Error('child not initialized')) })
  }

  if (req.kind === 'cancel') {
    inflight.get(req.reqId)?.controller.abort()
    return
  }

  if (req.kind === 'dispose-instance') {
    const entry = instances.get(req.instanceId)
    if (entry) {
      const disposable = entry.provider as { dispose?: () => Promise<void> | void }
      try {
        await disposable.dispose?.()
      } catch (err) {
        // best effort
      }
      instances.delete(req.instanceId)
    }
    return send({ kind: 'result', reqId: req.reqId, value: undefined })
  }

  if (req.kind === 'create-instance') {
    try {
      const cacheKey = `${req.providerKind}:${req.providerId}:${req.configKey}`
      const existing = instancesByConfig.get(cacheKey)
      if (existing && instances.has(existing)) {
        return send({ kind: 'instance', reqId: req.reqId, instanceId: existing })
      }
      const registry = req.providerKind === 'asr' ? registries.asr : registries.llm
      const provider = registry.resolve(req.providerId, req.config)
      const instanceId = randomUUID()
      instances.set(instanceId, {
        providerKind: req.providerKind,
        providerId: req.providerId,
        configKey: req.configKey,
        provider: provider as object
      })
      instancesByConfig.set(cacheKey, instanceId)
      return send({ kind: 'instance', reqId: req.reqId, instanceId })
    } catch (err) {
      return send({ kind: 'error', reqId: req.reqId, error: serializeError(err) })
    }
  }

  // invoke / invoke-stream
  const entry = instances.get(req.instanceId)
  if (!entry) {
    return send({
      kind: 'error',
      reqId: req.reqId,
      error: serializeError(new Error(`unknown instance ${req.instanceId}`))
    })
  }
  const controller = new AbortController()
  inflight.set(req.reqId, { controller })
  const args = injectSignal(req.args, controller.signal)
  const fn = (entry.provider as Record<string, unknown>)[req.method]
  if (typeof fn !== 'function') {
    inflight.delete(req.reqId)
    return send({
      kind: 'error',
      reqId: req.reqId,
      error: serializeError(new Error(`method ${req.method} not implemented on ${entry.providerId}`))
    })
  }
  try {
    if (req.kind === 'invoke') {
      const value = await (fn as (...a: unknown[]) => unknown).call(entry.provider, ...args)
      send({ kind: 'result', reqId: req.reqId, value })
    } else {
      const iterable = (fn as (...a: unknown[]) => AsyncIterable<unknown>).call(
        entry.provider,
        ...args
      )
      for await (const chunk of iterable) {
        send({ kind: 'stream-yield', reqId: req.reqId, value: chunk })
      }
      send({ kind: 'stream-end', reqId: req.reqId })
    }
  } catch (err) {
    if (req.kind === 'invoke') {
      send({ kind: 'error', reqId: req.reqId, error: serializeError(err) })
    } else {
      send({ kind: 'stream-error', reqId: req.reqId, error: serializeError(err) })
    }
  } finally {
    inflight.delete(req.reqId)
  }
}

const port = (process as unknown as {
  parentPort: { on: (event: 'message', cb: (msg: { data: ChildRequest | { kind: 'init'; defaultModelDir: string } }) => void) => void }
}).parentPort

port.on('message', (raw) => {
  const msg = raw.data
  if (msg.kind === 'init') {
    registries = createChildRegistries({ defaultModelDir: msg.defaultModelDir })
    send({ kind: 'ready' })
    return
  }
  void handle(msg)
})
```

> **Note:** `parentPort` import from `worker_threads` is unused at runtime — it's only there to silence type checkers if you prefer. The actual runtime mechanism is `process.parentPort` (Electron utilityProcess API). Remove the import if eslint flags it.

- [ ] **Step 3: Wire the child entry into the build**

Edit `apps/desktop/electron.vite.config.ts` and add a second rollup input under `main.build.rollupOptions`:

```ts
import { resolve } from 'path'
// ...
main: {
  build: {
    externalizeDeps: { /* unchanged */ },
    rollupOptions: {
      input: {
        index: resolve('src/main/index.ts'),
        'provider-host': resolve('src/main/provider-host/child/index.ts')
      },
      external: [
        'audify',
        'get-windows',
        'sherpa-onnx-node',
        /^sherpa-onnx-(darwin|linux|win)-/
      ]
    }
  },
  plugins: [svgRawPlugin]
},
```

The build will emit `out/main/index.js` and `out/main/provider-host.js`. The host loads the latter via `utilityProcess.fork(...)`.

- [ ] **Step 4: Build to verify the entry compiles**

```bash
pnpm --filter desktop typecheck:node
pnpm --filter desktop build
```

Expected: typecheck PASS, build emits both entries.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/provider-host/child apps/desktop/electron.vite.config.ts
git commit -m "feat(provider-host): utility process entry and child registries"
```

---

## Task 3: Build the main-side host

**Files:**
- Create: `apps/desktop/src/main/provider-host/host.ts`

**Background:** `ProviderHost` owns the utility process and the message channel. Public API:
- `start(opts: { defaultModelDir: string })`: spawns child, waits for `ready` message
- `createInstance(kind, providerId, config)`: returns Promise<instanceId>
- `invoke(instanceId, method, args)`: returns Promise<unknown>
- `invokeStream(instanceId, method, args)`: returns AsyncIterable<unknown>
- `dispose()`: kills child

It tracks pending requests in a map keyed by reqId. AbortSignal handling: callers pass an `AbortSignal`; if it aborts before resolution, host sends a `cancel` frame.

- [ ] **Step 1: Implement host.ts**

```ts
// apps/desktop/src/main/provider-host/host.ts
import { app, MessageChannelMain, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  type ChildRequest,
  type ChildResponse,
  type ProviderKind,
  type SerializedError,
  deserializeError,
  stableConfigKey
} from './protocol'

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  cleanup?: () => void
}

interface PendingStream {
  push: (chunk: unknown) => void
  end: () => void
  error: (err: Error) => void
}

export class ProviderHost {
  private process: UtilityProcess | null = null
  private port: Electron.MessagePortMain | null = null
  private readyPromise: Promise<void> | null = null
  private readonly calls = new Map<string, PendingCall>()
  private readonly streams = new Map<string, PendingStream>()

  async start(opts: { defaultModelDir: string }): Promise<void> {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const childEntry = join(__dirname, 'provider-host.js') // emitted by electron-vite
      const child = utilityProcess.fork(childEntry, [], { stdio: 'inherit' })
      this.process = child
      child.once('exit', (code) => {
        this.handleCrash(new Error(`provider host exited (code=${code ?? 'null'})`))
      })
      child.once('spawn', () => {
        const { port1, port2 } = new MessageChannelMain()
        this.port = port1
        port1.on('message', (event) => this.onMessage(event.data as ChildResponse))
        port1.start()
        // Hand port2 to child; once child receives it, it sends 'ready'
        child.postMessage({ kind: 'init', defaultModelDir: opts.defaultModelDir }, [port2])
        // Wait for ready handshake
        const readyTimeout = setTimeout(() => {
          reject(new Error('provider host did not become ready within 10s'))
        }, 10_000)
        const onReady = (msg: ChildResponse): void => {
          if (msg.kind === 'ready') {
            clearTimeout(readyTimeout)
            this.removeReadyListener = () => {}
            resolve()
          }
        }
        this.removeReadyListener = (): void => {
          this.readyListener = null
        }
        this.readyListener = onReady
      })
    })
    return this.readyPromise
  }

  private readyListener: ((msg: ChildResponse) => void) | null = null
  private removeReadyListener: () => void = () => {}

  // The child receives the port via process.parentPort.on('message') with the
  // first message containing transferred ports. The parentPort is implicit —
  // utilityProcess wires process.parentPort to the channel created here.
  // We post the init payload and (separately) a port for two-way comms.
  // NOTE: Electron's utilityProcess actually uses parentPort.postMessage on
  // the child side and child.postMessage on the parent side. The example
  // above uses MessageChannelMain to keep a clean send/recv on the parent
  // side. If on review you find `child.postMessage` already produces a
  // bidirectional `parentPort` on the child, prefer that and remove the
  // MessageChannelMain plumbing.

  async createInstance(
    kind: ProviderKind,
    providerId: string,
    config: unknown
  ): Promise<string> {
    await this.ensureReady()
    const reqId = randomUUID()
    const configKey = stableConfigKey(config)
    const result = await this.send<{ kind: 'instance'; reqId: string; instanceId: string }>({
      kind: 'create-instance',
      reqId,
      providerKind: kind,
      providerId,
      configKey,
      config
    })
    return result.instanceId
  }

  async invoke(
    instanceId: string,
    method: string,
    args: unknown[],
    opts: { signal?: AbortSignal } = {}
  ): Promise<unknown> {
    await this.ensureReady()
    const reqId = randomUUID()
    const marshalled = marshalArgs(args)
    return this.sendWithCancel(
      { kind: 'invoke', reqId, instanceId, method, args: marshalled },
      reqId,
      opts.signal
    )
  }

  invokeStream(
    instanceId: string,
    method: string,
    args: unknown[],
    opts: { signal?: AbortSignal } = {}
  ): AsyncIterable<unknown> {
    const self = this
    const reqId = randomUUID()
    const marshalled = marshalArgs(args)
    let queue: unknown[] = []
    let finished = false
    let errorObj: Error | null = null
    let waker: (() => void) | null = null

    const stream: PendingStream = {
      push: (chunk) => {
        queue.push(chunk)
        waker?.()
      },
      end: () => {
        finished = true
        waker?.()
      },
      error: (err) => {
        errorObj = err
        finished = true
        waker?.()
      }
    }
    self.streams.set(reqId, stream)

    const abortHandler = (): void => {
      self.send({ kind: 'cancel', reqId }).catch(() => {})
    }
    if (opts.signal) {
      if (opts.signal.aborted) abortHandler()
      else opts.signal.addEventListener('abort', abortHandler, { once: true })
    }

    void (async () => {
      try {
        await self.ensureReady()
        self.postRequest({ kind: 'invoke-stream', reqId, instanceId, method, args: marshalled })
      } catch (err) {
        stream.error(err instanceof Error ? err : new Error(String(err)))
      }
    })()

    async function* iterate(): AsyncIterable<unknown> {
      try {
        while (true) {
          if (queue.length > 0) {
            const next = queue
            queue = []
            for (const item of next) yield item
            continue
          }
          if (errorObj) throw errorObj
          if (finished) return
          await new Promise<void>((r) => {
            waker = (): void => {
              waker = null
              r()
            }
          })
        }
      } finally {
        self.streams.delete(reqId)
        opts.signal?.removeEventListener('abort', abortHandler)
      }
    }

    return iterate()
  }

  async dispose(): Promise<void> {
    this.process?.kill()
    this.process = null
    this.port = null
    this.readyPromise = null
    for (const call of this.calls.values()) {
      call.reject(new Error('provider host disposed'))
    }
    this.calls.clear()
    for (const stream of this.streams.values()) {
      stream.error(new Error('provider host disposed'))
    }
    this.streams.clear()
  }

  private ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      throw new Error('ProviderHost not started')
    }
    return this.readyPromise
  }

  private postRequest(req: ChildRequest): void {
    if (!this.port) throw new Error('provider host port not connected')
    this.port.postMessage(req)
  }

  private async send<R extends ChildResponse>(req: ChildRequest): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.calls.set('reqId' in req ? req.reqId : '', {
        resolve: (v) => resolve(v as R),
        reject
      })
      try {
        this.postRequest(req)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  private async sendWithCancel<R>(
    req: ChildRequest & { reqId: string },
    reqId: string,
    signal?: AbortSignal
  ): Promise<R> {
    const onAbort = (): void => {
      this.send({ kind: 'cancel', reqId }).catch(() => {})
    }
    try {
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      const value = await this.send<ChildResponse>(req)
      if (value.kind === 'result') return value.value as R
      if (value.kind === 'instance') return value as unknown as R
      throw new Error(`unexpected response kind ${value.kind}`)
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private onMessage(msg: ChildResponse): void {
    if (msg.kind === 'ready') {
      this.readyListener?.(msg)
      return
    }
    if (msg.kind === 'instance' || msg.kind === 'result') {
      const call = this.calls.get(msg.reqId)
      if (!call) return
      this.calls.delete(msg.reqId)
      call.resolve(msg)
      return
    }
    if (msg.kind === 'error') {
      const call = this.calls.get(msg.reqId)
      if (call) {
        this.calls.delete(msg.reqId)
        call.reject(deserializeError(msg.error))
        return
      }
      const stream = this.streams.get(msg.reqId)
      if (stream) stream.error(deserializeError(msg.error))
      return
    }
    if (msg.kind === 'stream-yield') {
      this.streams.get(msg.reqId)?.push(msg.value)
      return
    }
    if (msg.kind === 'stream-end') {
      this.streams.get(msg.reqId)?.end()
      return
    }
    if (msg.kind === 'stream-error') {
      this.streams.get(msg.reqId)?.error(deserializeError(msg.error))
      return
    }
  }

  private handleCrash(err: Error): void {
    for (const call of this.calls.values()) call.reject(err)
    this.calls.clear()
    for (const stream of this.streams.values()) stream.error(err)
    this.streams.clear()
    this.process = null
    this.port = null
    this.readyPromise = null
    console.error('[provider-host] crashed:', err.message)
  }
}

const SIGNAL_SLOT_MARKER = '__signalSlot' as const

function marshalArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof AbortSignal) return { [SIGNAL_SLOT_MARKER]: true }
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      const out: Record<string, unknown> = {}
      let changed = false
      for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
        if (v instanceof AbortSignal) {
          out[k] = { [SIGNAL_SLOT_MARKER]: true }
          changed = true
        } else {
          out[k] = v
        }
      }
      return changed ? out : arg
    }
    return arg
  })
}

let singleton: ProviderHost | null = null
export function getProviderHost(): ProviderHost {
  if (!singleton) singleton = new ProviderHost()
  return singleton
}
```

> **Implementation note for the implementer:** The Electron `utilityProcess` API gives the child a built-in `process.parentPort` that already supports bidirectional `postMessage`/`on('message')`. You do **not** strictly need a separate `MessageChannelMain` — `child.postMessage(req)` on the parent side and `process.parentPort.postMessage(res)` / `process.parentPort.on('message', ...)` on the child side already form a duplex channel. Implementer: prefer that simpler shape and delete the `MessageChannelMain` plumbing if it works. The init handshake then becomes `child.postMessage({ kind: 'init', defaultModelDir })` directly. The protocol is unchanged either way.

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter desktop typecheck:node
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/provider-host/host.ts
git commit -m "feat(provider-host): main-side ProviderHost (utilityProcess wrapper)"
```

---

## Task 4: Integration test — host ↔ child round-trip

**Files:**
- Create: `apps/desktop/src/main/provider-host/__tests__/host-integration.test.ts`

**Background:** This test does NOT spawn an Electron utility process (vitest can't easily). Instead it asserts the protocol contract by stubbing the transport: it instantiates `ProviderHost` with a fake transport that routes messages to a test-only child built by importing the child entry's dispatch logic with the registries replaced by stubs.

**Strategy:** Refactor minimally — extract the child's dispatch loop into an exported function `dispatchChild(req, send, registries)` so the test can drive it without `process.parentPort`.

- [ ] **Step 1: Refactor child to expose dispatch**

Edit `apps/desktop/src/main/provider-host/child/index.ts`:
- Move the `handle` function and the `instances`/`inflight` maps into a class `ChildDispatcher` exported from the same file (or a new sibling `dispatcher.ts`).
- Keep the `process.parentPort.on('message', ...)` glue at the bottom invoking the dispatcher.

Suggested new file: `apps/desktop/src/main/provider-host/child/dispatcher.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { type ChildRequest, type ChildResponse, serializeError } from '../protocol'
import type { ChildRegistries } from './registries'

export type Sender = (msg: ChildResponse) => void

export class ChildDispatcher {
  private readonly instances = new Map<string, { providerKind: 'asr' | 'llm'; provider: object }>()
  private readonly instancesByConfig = new Map<string, string>()
  private readonly inflight = new Map<string, AbortController>()

  constructor(
    private readonly registries: ChildRegistries,
    private readonly send: Sender
  ) {}

  async handle(req: ChildRequest): Promise<void> {
    // ... move the body of handle() here, replacing send(...) with this.send(...)
    // and `instances`/`inflight` references with `this.*`.
  }
}
```

The `child/index.ts` then becomes a thin glue:

```ts
import { type ChildRequest, type ChildResponse } from '../protocol'
import { ChildDispatcher } from './dispatcher'
import { createChildRegistries } from './registries'

const port = (process as unknown as {
  parentPort: {
    on: (event: 'message', cb: (msg: { data: ChildRequest | { kind: 'init'; defaultModelDir: string } }) => void) => void
    postMessage: (msg: ChildResponse) => void
  }
}).parentPort

let dispatcher: ChildDispatcher | null = null

port.on('message', (raw) => {
  const msg = raw.data
  if (msg.kind === 'init') {
    const registries = createChildRegistries({ defaultModelDir: msg.defaultModelDir })
    dispatcher = new ChildDispatcher(registries, (m) => port.postMessage(m))
    port.postMessage({ kind: 'ready' })
    return
  }
  void dispatcher?.handle(msg)
})
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/desktop/src/main/provider-host/__tests__/host-integration.test.ts
import { describe, expect, it } from 'vitest'
import { ChildDispatcher } from '../child/dispatcher'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import type { ChildRegistries } from '../child/registries'
import type { ChildRequest, ChildResponse } from '../protocol'
import { ConfigurationError, ProviderError } from '@openbroca/providers'

function makeRegistriesWithStubASR(): ChildRegistries {
  const asr = new ASRProviderRegistry()
  asr.register({
    id: 'stub',
    displayName: 'Stub ASR',
    description: '',
    kind: 'cloud',
    configSchema: { parse: (v) => v },
    create: () => ({
      id: 'stub',
      displayName: 'Stub ASR',
      isConfigured: () => true,
      recognize: async () => ({ text: 'hello world', segments: [] })
    })
  })
  return { asr, llm: new LLMProviderRegistry() }
}

describe('ChildDispatcher', () => {
  it('creates an instance and invokes recognize', async () => {
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(makeRegistriesWithStubASR(), (m) => responses.push(m))
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const created = responses.find((r) => r.kind === 'instance')!
    expect(created.kind).toBe('instance')
    if (created.kind !== 'instance') throw new Error()

    await dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: created.instanceId,
      method: 'recognize',
      args: [{ audio: new Uint8Array(0) }, {}]
    })
    const result = responses.find((r) => r.kind === 'result' && r.reqId === '2')!
    expect(result.kind).toBe('result')
    if (result.kind !== 'result') throw new Error()
    expect(result.value).toEqual({ text: 'hello world', segments: [] })
  })

  it('serializes ProviderError on failure', async () => {
    const asr = new ASRProviderRegistry()
    asr.register({
      id: 'broken',
      displayName: 'Broken',
      description: '',
      kind: 'cloud',
      configSchema: { parse: (v) => v },
      create: () => ({
        id: 'broken',
        displayName: 'Broken',
        isConfigured: () => true,
        recognize: async () => {
          throw new ConfigurationError('broken', 'no key')
        }
      })
    })
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher({ asr, llm: new LLMProviderRegistry() }, (m) =>
      responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'broken',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error()
    await dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'recognize',
      args: [{ audio: new Uint8Array(0) }, {}]
    })
    const err = responses.find((r) => r.kind === 'error' && r.reqId === '2')
    expect(err?.kind).toBe('error')
    if (err?.kind !== 'error') throw new Error()
    expect(err.error.name).toBe('ConfigurationError')
    expect(err.error.providerId).toBe('broken')
  })

  it('streams async iterable chunks until end', async () => {
    const asr = new ASRProviderRegistry()
    asr.register({
      id: 'streamer',
      displayName: 'Streamer',
      description: '',
      kind: 'local',
      configSchema: { parse: (v) => v },
      create: () => ({
        id: 'streamer',
        displayName: 'Streamer',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] }),
        async *installModel() {
          yield { phase: 'downloading', downloadedBytes: 50, totalBytes: 100 }
          yield { phase: 'downloading', downloadedBytes: 100, totalBytes: 100 }
          yield { phase: 'finalizing' }
        }
      })
    })
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher({ asr, llm: new LLMProviderRegistry() }, (m) =>
      responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'streamer',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error()
    await dispatcher.handle({
      kind: 'invoke-stream',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'installModel',
      args: ['model-a']
    })
    const yields = responses.filter((r) => r.kind === 'stream-yield' && r.reqId === '2')
    expect(yields).toHaveLength(3)
    const end = responses.find((r) => r.kind === 'stream-end' && r.reqId === '2')
    expect(end).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter desktop exec vitest run src/main/provider-host/__tests__/host-integration.test.ts
```

Expected: FAIL — `ChildDispatcher` not yet a class export, or refactor incomplete.

- [ ] **Step 4: Complete the dispatcher.ts implementation**

Move the `handle` body from the original `child/index.ts` (Task 2 Step 2) into `ChildDispatcher.handle`. Reference its own private maps. Keep behavior identical.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter desktop exec vitest run src/main/provider-host/__tests__/host-integration.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/provider-host/child apps/desktop/src/main/provider-host/__tests__/host-integration.test.ts
git commit -m "test(provider-host): dispatcher round-trip coverage"
```

---

## Task 5: Build the ASR remote proxy

**Files:**
- Create: `apps/desktop/src/main/provider-host/remote-asr-proxy.ts`

**Background:** Implements `LocalASRProvider & StreamingASRProvider` (the union of the contract). Every method delegates to `host.invoke` or `host.invokeStream` with method name + args. The proxy holds `instanceId` from `host.createInstance` and the static `id`/`displayName` from the descriptor.

- [ ] **Step 1: Implement remote-asr-proxy.ts**

```ts
// apps/desktop/src/main/provider-host/remote-asr-proxy.ts
import type {
  InstalledLocalModel,
  LocalASRProvider,
  LocalCatalogModel,
  LocalModelInstallEvent,
  LocalModelRuntime,
  RecognitionInput,
  RecognitionOptions,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent
} from '@openbroca/providers/asr'
import type { ProviderHost } from './host'

export interface RemoteASRProxyOptions {
  host: ProviderHost
  instanceId: string
  providerId: string
  displayName: string
  isLocal: boolean
}

export class RemoteASRProvider implements LocalASRProvider, StreamingASRProvider {
  readonly id: string
  readonly displayName: string
  private readonly host: ProviderHost
  private readonly instanceId: string
  private readonly isLocal: boolean

  constructor(opts: RemoteASRProxyOptions) {
    this.id = opts.providerId
    this.displayName = opts.displayName
    this.host = opts.host
    this.instanceId = opts.instanceId
    this.isLocal = opts.isLocal
  }

  isConfigured(): boolean {
    // Cached at proxy construction is unsafe (config changes). Instead, treat
    // proxies that exist as configured — runtime.ts only constructs them after
    // resolveActiveASRSelection has validated config.
    return true
  }

  async recognize(input: RecognitionInput, options?: RecognitionOptions): Promise<RecognitionResult> {
    const result = await this.host.invoke(
      this.instanceId,
      'recognize',
      [input, options ?? {}],
      { signal: options?.signal }
    )
    return result as RecognitionResult
  }

  transcribe(
    input: RecognitionInput,
    options?: RecognitionOptions
  ): AsyncIterable<TranscriptionEvent> {
    const stream = this.host.invokeStream(
      this.instanceId,
      'transcribe',
      [input, options ?? {}],
      { signal: options?.signal }
    )
    return stream as AsyncIterable<TranscriptionEvent>
  }

  async listCatalogModels(): Promise<LocalCatalogModel[]> {
    if (!this.isLocal) throw new Error(`${this.id} is not a local ASR provider`)
    return (await this.host.invoke(this.instanceId, 'listCatalogModels', [])) as LocalCatalogModel[]
  }

  async scanInstalledModels(): Promise<InstalledLocalModel[]> {
    if (!this.isLocal) throw new Error(`${this.id} is not a local ASR provider`)
    return (await this.host.invoke(this.instanceId, 'scanInstalledModels', [])) as InstalledLocalModel[]
  }

  installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent> {
    if (!this.isLocal) throw new Error(`${this.id} is not a local ASR provider`)
    const stream = this.host.invokeStream(
      this.instanceId,
      'installModel',
      [modelId, signal],
      { signal }
    )
    return stream as AsyncIterable<LocalModelInstallEvent>
  }

  async removeInstalledModel(modelId: string): Promise<void> {
    if (!this.isLocal) throw new Error(`${this.id} is not a local ASR provider`)
    await this.host.invoke(this.instanceId, 'removeInstalledModel', [modelId])
  }

  async resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime> {
    if (!this.isLocal) throw new Error(`${this.id} is not a local ASR provider`)
    return (await this.host.invoke(this.instanceId, 'resolveModelRuntime', [
      selectedModelId
    ])) as LocalModelRuntime
  }
}
```

> **Caveat for non-local proxies:** When the resolved provider is cloud (deepgram), the methods inherited from `LocalASRProvider` should never be called by callers — they only call `recognize`. The `isLocal` flag protects against accidental misuse. However the proxy implements the union interface for type compatibility with the existing `AnyASRProvider` union. Discriminate via the registry's `isLocal()` helper at the call site, as today.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter desktop typecheck:node
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/provider-host/remote-asr-proxy.ts
git commit -m "feat(provider-host): RemoteASRProvider proxy"
```

---

## Task 6: Build the LLM remote proxy

**Files:**
- Create: `apps/desktop/src/main/provider-host/remote-llm-proxy.ts`

- [ ] **Step 1: Implement remote-llm-proxy.ts**

```ts
// apps/desktop/src/main/provider-host/remote-llm-proxy.ts
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '@openbroca/providers/llm'
import type { ProviderHost } from './host'

export interface RemoteLLMProxyOptions {
  host: ProviderHost
  instanceId: string
  providerId: string
  displayName: string
}

export class RemoteLLMProvider implements LLMProvider {
  readonly id: string
  readonly displayName: string
  private readonly host: ProviderHost
  private readonly instanceId: string

  constructor(opts: RemoteLLMProxyOptions) {
    this.id = opts.providerId
    this.displayName = opts.displayName
    this.host = opts.host
    this.instanceId = opts.instanceId
  }

  isConfigured(): boolean {
    return true
  }

  async listModels(signal?: AbortSignal): Promise<LLMModel[]> {
    return (await this.host.invoke(this.instanceId, 'listModels', [signal], { signal })) as LLMModel[]
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    return (await this.host.invoke(
      this.instanceId,
      'generate',
      [request],
      { signal: request.signal }
    )) as CompletionResult
  }

  complete(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    return this.host.invokeStream(
      this.instanceId,
      'complete',
      [request],
      { signal: request.signal }
    ) as AsyncIterable<CompletionChunk>
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    return (await this.host.invoke(this.instanceId, 'validateConnection', [])) as {
      ok: boolean
      error?: string
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter desktop typecheck:node
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/provider-host/remote-llm-proxy.ts
git commit -m "feat(provider-host): RemoteLLMProvider proxy"
```

---

## Task 7: Wire the host into runtime.ts (the swap)

**Files:**
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Background:** This is the swap point. Today `runtime.ts` calls `deps.asrRegistry.resolve(providerId, config)` (which calls `descriptor.create(config)` in-process). After this task, it instead calls `host.createInstance(...)` and wraps in a `RemoteASRProvider` proxy.

**Important:** The descriptors stay in main-side registries (for setup status, schema, capabilities, UI metadata, `isLocal()` lookup). Only `descriptor.create()` is no longer called for runtime use — replaced by remote instantiation.

- [ ] **Step 1: Read the current runtime.ts to confirm the call sites**

```bash
sed -n '85,205p' apps/desktop/src/main/providers/runtime.ts
```

(Read it via the Read tool to confirm exact signatures around `resolve(providerId, config)`.)

- [ ] **Step 2: Update resolveActiveASRSelection to return a proxy**

Replace the body of `resolveActiveASRSelection` (apps/desktop/src/main/providers/runtime.ts:95–130) so that instead of:

```ts
const provider = deps.asrRegistry.resolve(providerId, providerRecord.config ?? {})
```

it does:

```ts
const descriptor = deps.asrRegistry.getDescriptor(providerId) // or whatever the registry exposes
if (!descriptor) {
  throw new ConfigurationError(providerId, `provider ${providerId} not registered`)
}
const config = providerRecord.config ?? {}
// Validate config in main using the descriptor's schema (preserves current behavior).
descriptor.configSchema.parse(config)

const host = getProviderHost()
const instanceId = await host.createInstance('asr', providerId, config)
const provider = new RemoteASRProvider({
  host,
  instanceId,
  providerId,
  displayName: descriptor.displayName,
  isLocal: descriptor.kind === 'local'
}) as unknown as ASRProvider
```

The local-model validation block (`provider.resolveModelRuntime(selectedModelId)`) stays unchanged — it now calls the proxy, which forwards to the child. Same observable behavior.

> **Note for implementer:** Inspect the current `ASRProviderRegistry` API for descriptor lookup. If it doesn't expose a `getDescriptor` method, either (a) add one to the base `ProviderRegistry` class in `packages/providers/src/shared/provider-registry.ts` (preferred — it's a pure addition), or (b) iterate `listDescriptors()` to find by id. Choose (a) and add a small unit test in the providers package.

Add the imports at the top:

```ts
import { getProviderHost } from '../provider-host/host'
import { RemoteASRProvider } from '../provider-host/remote-asr-proxy'
```

- [ ] **Step 3: Update resolveLLMProvider to return a proxy**

Replace `resolveLLMProvider` body:

```ts
export async function resolveLLMProvider(
  providerId: string,
  deps: LLMProviderRuntimeDeps
): Promise<LLMProvider> {
  const config = await getLLMProviderRuntimeConfig(providerId, deps)
  const descriptor = deps.llmRegistry.getDescriptor(providerId)
  if (!descriptor) {
    throw new ConfigurationError(providerId, `provider ${providerId} not registered`)
  }
  const host = getProviderHost()
  const instanceId = await host.createInstance('llm', providerId, config)
  return new RemoteLLMProvider({
    host,
    instanceId,
    providerId,
    displayName: descriptor.displayName
  })
}
```

Add the imports:

```ts
import { RemoteLLMProvider } from '../provider-host/remote-llm-proxy'
```

- [ ] **Step 4: Start the host at app boot**

In `apps/desktop/src/main/index.ts`, near where `registerLocalASRProviders` is called and before any tRPC routers/providers are used, start the host:

```ts
import { getProviderHost } from './provider-host/host'
// ...
const defaultModelDir = join(app.getPath('userData'), 'asr-models', 'sherpa-onnx')
registerLocalASRProviders({ defaultModelDir })
await getProviderHost().start({ defaultModelDir })
```

Place this **after** `app.whenReady()` resolves and **before** the first tRPC handler is wired or the post-recording pipeline is constructed.

> **Important:** Confirm the actual `defaultModelDir` value used by `registerLocalASRProviders` today (search for `registerLocalASRProviders(` in `apps/desktop/src/main/index.ts`) and pass exactly the same value to `host.start()`.

Add a graceful shutdown in the `before-quit` / `will-quit` handler:

```ts
app.on('will-quit', () => {
  void getProviderHost().dispose()
})
```

- [ ] **Step 5: Run the existing main-process tests to verify no regressions**

```bash
pnpm --filter desktop exec vitest run
```

Expected: PASS — all existing tests still pass. (Some tests may need stub updates if they construct providers directly; in that case, mock `getProviderHost` to return a fake.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/providers/runtime.ts apps/desktop/src/main/index.ts
git commit -m "feat(provider-host): swap runtime resolvers to remote proxies"
```

---

## Task 8: End-to-end verification (manual + automated)

This task has no code commit; it is a verification gate.

- [ ] **Step 1: Build and run the dev app**

```bash
pnpm --filter desktop dev
```

- [ ] **Step 2: Verify the post-recording pipeline does NOT freeze the UI**

Reproduce the original symptom: trigger a voice recording with sherpa-onnx (Local) selected as ASR and OpenAI as LLM. While the post-recording pipeline runs:
- Try to drag the main window — it MUST move smoothly.
- Cursor MUST NOT show the loading spinner.
- Watch the dev console — there MUST NOT be any `CGEventTap timeout!` lines during the storage/ASR/LLM stages.

- [ ] **Step 3: Verify functional correctness**

- Transcript and LLM result still appear correctly.
- Final-text delivery still works.
- Listening state transitions correctly back to idle.
- Pipeline timeline logs still appear (storage → asr → llm), and the gap between stages is now small (the heavy work happens off the main thread, but main-side overhead per stage should be <50 ms).

- [ ] **Step 4: Verify local model install streaming still works**

Open Providers UI → Sherpa-ONNX → install a model. The progress events MUST stream into the UI as before. Cancellation MUST work (close the modal mid-install).

- [ ] **Step 5: Verify cloud ASR (Deepgram) still works**

Switch ASR to Deepgram (if configured). Trigger a recording. Transcription must complete.

- [ ] **Step 6: Verify provider config errors surface correctly**

Temporarily clear the OpenAI API key. Trigger a recording. The pipeline must fail with `ConfigurationError` from the LLM stage, and the error must propagate to the UI as it does today (not be swallowed by the IPC layer).

- [ ] **Step 7: Production build smoke test**

```bash
pnpm --filter desktop build
```

Verify both `out/main/index.js` and `out/main/provider-host.js` are emitted. Open the packaged app (or the rebuilt dev app) and re-run Steps 2–3.

---

## Self-Review

**Spec coverage** (against the user's two asks):
- ✅ Plan A (`utilityProcess`): Tasks 2 (child entry), 3 (host).
- ✅ All providers (ASR + LLM) migrated: ASR proxy in Task 5, LLM proxy in Task 6, both wired in Task 7.

**Placeholder scan:** No "TBD" / "implement later" / "similar to" present. Each step has actual code or actual commands.

**Type consistency:**
- `RemoteASRProvider` constructor takes `RemoteASRProxyOptions` (Task 5); `runtime.ts` passes the same shape (Task 7).
- `RemoteLLMProvider` likewise.
- `ChildDispatcher` (Task 4) signature `(registries, send)` matches usage in `child/index.ts`.
- `ProviderHost.createInstance(kind, providerId, config)` returns `string` instanceId; matches Task 7 usage.
- Protocol message kinds in `protocol.ts` (Task 1) are referenced consistently in dispatcher (Task 4) and host (Task 3).

**Gap callouts to flag during execution:**
1. Confirm `ASRProviderRegistry`/`LLMProviderRegistry` expose a `getDescriptor(id)` method or add one (Task 7 Step 2 note).
2. Confirm exact LLM descriptor list in `apps/desktop/src/main/providers/index.ts` matches Task 2 Step 1 imports.
3. Confirm Electron `utilityProcess` parent↔child duplex via `child.postMessage` + `process.parentPort` works without `MessageChannelMain` — simplify Task 3 if so (call-out is in Task 3).
4. Some existing tests may construct providers via the registry directly; if Task 7 breaks them, the test should be updated to mock `getProviderHost`.
