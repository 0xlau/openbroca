import { randomUUID } from 'node:crypto'
import {
  isSignalSlot,
  serializeError,
  type ChildRequest,
  type ChildResponse,
  type ProviderKind
} from '../protocol'
import type { ChildRegistries } from './registries'

export type Sender = (msg: ChildResponse) => void

interface InstanceEntry {
  providerKind: ProviderKind
  providerId: string
  configKey: string
  provider: object
}

export class ChildDispatcher {
  private readonly instances = new Map<string, InstanceEntry>()
  private readonly instancesByConfig = new Map<string, string>()
  private readonly inflight = new Map<string, AbortController>()

  constructor(
    private readonly registries: ChildRegistries,
    private readonly send: Sender
  ) {}

  async handle(req: ChildRequest): Promise<void> {
    if (req.kind === 'cancel') {
      this.inflight.get(req.reqId)?.abort()
      return
    }

    if (req.kind === 'dispose-instance') {
      const entry = this.instances.get(req.instanceId)
      if (entry) {
        const disposable = entry.provider as { dispose?: () => Promise<void> | void }
        try {
          await disposable.dispose?.()
        } catch {
          // Best-effort dispose — never block the caller.
        }
        this.instances.delete(req.instanceId)
        this.instancesByConfig.delete(
          `${entry.providerKind}:${entry.providerId}:${entry.configKey}`
        )
      }
      this.send({ kind: 'result', reqId: req.reqId, value: undefined })
      return
    }

    if (req.kind === 'create-instance') {
      try {
        const cacheKey = `${req.providerKind}:${req.providerId}:${req.configKey}`
        const existing = this.instancesByConfig.get(cacheKey)
        if (existing && this.instances.has(existing)) {
          this.send({ kind: 'instance', reqId: req.reqId, instanceId: existing })
          return
        }
        const registry =
          req.providerKind === 'asr' ? this.registries.asr : this.registries.llm
        const provider = registry.resolve(req.providerId, req.config)
        const instanceId = randomUUID()
        this.instances.set(instanceId, {
          providerKind: req.providerKind,
          providerId: req.providerId,
          configKey: req.configKey,
          provider: provider as unknown as object
        })
        this.instancesByConfig.set(cacheKey, instanceId)
        this.send({ kind: 'instance', reqId: req.reqId, instanceId })
      } catch (err) {
        this.send({ kind: 'error', reqId: req.reqId, error: serializeError(err) })
      }
      return
    }

    // invoke / invoke-stream
    const entry = this.instances.get(req.instanceId)
    if (!entry) {
      const error = serializeError(new Error(`unknown instance ${req.instanceId}`))
      if (req.kind === 'invoke') {
        this.send({ kind: 'error', reqId: req.reqId, error })
      } else {
        this.send({ kind: 'stream-error', reqId: req.reqId, error })
      }
      return
    }
    const controller = new AbortController()
    this.inflight.set(req.reqId, controller)
    const args = injectSignal(req.args, controller.signal)
    const fn = (entry.provider as Record<string, unknown>)[req.method]
    if (typeof fn !== 'function') {
      this.inflight.delete(req.reqId)
      const error = serializeError(
        new Error(`method ${req.method} not implemented on ${entry.providerId}`)
      )
      if (req.kind === 'invoke') {
        this.send({ kind: 'error', reqId: req.reqId, error })
      } else {
        this.send({ kind: 'stream-error', reqId: req.reqId, error })
      }
      return
    }
    try {
      if (req.kind === 'invoke') {
        const value = await (fn as (...a: unknown[]) => unknown).call(entry.provider, ...args)
        this.send({ kind: 'result', reqId: req.reqId, value })
      } else {
        const iterable = (fn as (...a: unknown[]) => AsyncIterable<unknown>).call(
          entry.provider,
          ...args
        )
        for await (const chunk of iterable) {
          this.send({ kind: 'stream-yield', reqId: req.reqId, value: chunk })
        }
        this.send({ kind: 'stream-end', reqId: req.reqId })
      }
    } catch (err) {
      if (req.kind === 'invoke') {
        this.send({ kind: 'error', reqId: req.reqId, error: serializeError(err) })
      } else {
        this.send({ kind: 'stream-error', reqId: req.reqId, error: serializeError(err) })
      }
    } finally {
      this.inflight.delete(req.reqId)
    }
  }
}

// One signal per call is sufficient — recognize/generate/installModel each
// take at most one. We walk one level deep into objects because RecognitionOptions
// and CompletionRequest both nest the signal inside the request payload.
function injectSignal(args: unknown[], signal: AbortSignal): unknown[] {
  return args.map((arg) => {
    if (isSignalSlot(arg)) return signal
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      let changed = false
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
        if (isSignalSlot(v)) {
          out[k] = signal
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
