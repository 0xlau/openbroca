import { app, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  SIGNAL_SLOT_MARKER,
  deserializeError,
  stableConfigKey,
  type ChildInit,
  type ChildRequest,
  type ChildResponse,
  type ProviderKind
} from './protocol'

interface PendingCall {
  resolve: (value: ChildResponse) => void
  reject: (error: Error) => void
}

interface PendingStream {
  push: (chunk: unknown) => void
  end: () => void
  error: (err: Error) => void
}

const READY_TIMEOUT_MS = 10_000

export class ProviderHost {
  private process: UtilityProcess | null = null
  private readyPromise: Promise<void> | null = null
  private readonly calls = new Map<string, PendingCall>()
  private readonly streams = new Map<string, PendingStream>()

  async start(opts: { defaultModelDir: string }): Promise<void> {
    if (this.readyPromise) return this.readyPromise

    const childEntry = join(app.getAppPath(), 'out/main/provider-host.js')
    const child = utilityProcess.fork(childEntry, [], { stdio: 'inherit' })
    this.process = child

    child.on('message', (data: unknown) => this.onMessage(data as ChildResponse))
    child.on('exit', (code) => {
      this.handleCrash(new Error(`provider host exited (code=${code ?? 'null'})`))
    })

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`provider host did not become ready within ${READY_TIMEOUT_MS}ms`))
      }, READY_TIMEOUT_MS)

      const onSpawn = (): void => {
        const init: ChildInit = { kind: 'init', defaultModelDir: opts.defaultModelDir }
        child.postMessage(init)
      }
      child.once('spawn', onSpawn)

      this.readyResolver = (): void => {
        clearTimeout(timer)
        resolve()
      }
      this.readyRejecter = (err): void => {
        clearTimeout(timer)
        reject(err)
      }
    })
    return this.readyPromise
  }

  private readyResolver: (() => void) | null = null
  private readyRejecter: ((err: Error) => void) | null = null

  async createInstance(
    kind: ProviderKind,
    providerId: string,
    config: unknown
  ): Promise<string> {
    await this.ensureReady()
    const reqId = randomUUID()
    const configKey = stableConfigKey(config)
    const response = await this.sendRequest({
      kind: 'create-instance',
      reqId,
      providerKind: kind,
      providerId,
      configKey,
      config
    })
    if (response.kind !== 'instance') {
      throw new Error(`unexpected response for create-instance: ${response.kind}`)
    }
    return response.instanceId
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
    return this.sendRequestWithCancel(
      { kind: 'invoke', reqId, instanceId, method, args: marshalled },
      reqId,
      opts.signal
    ).then((response) => {
      if (response.kind === 'result') return response.value
      throw new Error(`unexpected response for invoke: ${response.kind}`)
    })
  }

  invokeStream(
    instanceId: string,
    method: string,
    args: unknown[],
    opts: { signal?: AbortSignal } = {}
  ): AsyncIterable<unknown> {
    const reqId = randomUUID()
    const marshalled = marshalArgs(args)
    const queue: unknown[] = []
    let finished = false
    let errorObj: Error | null = null
    let waker: (() => void) | null = null

    this.streams.set(reqId, {
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
    })

    const abortHandler = (): void => {
      this.postRequest({ kind: 'cancel', reqId })
    }
    if (opts.signal) {
      if (opts.signal.aborted) abortHandler()
      else opts.signal.addEventListener('abort', abortHandler, { once: true })
    }

    const sendStart = async (): Promise<void> => {
      try {
        await this.ensureReady()
        this.postRequest({
          kind: 'invoke-stream',
          reqId,
          instanceId,
          method,
          args: marshalled
        })
      } catch (err) {
        const stream = this.streams.get(reqId)
        stream?.error(err instanceof Error ? err : new Error(String(err)))
      }
    }
    void sendStart()

    const self = this

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<unknown>> {
            while (true) {
              if (queue.length > 0) {
                const value = queue.shift()
                return { value, done: false }
              }
              if (errorObj) {
                self.streams.delete(reqId)
                opts.signal?.removeEventListener('abort', abortHandler)
                throw errorObj
              }
              if (finished) {
                self.streams.delete(reqId)
                opts.signal?.removeEventListener('abort', abortHandler)
                return { value: undefined, done: true }
              }
              await new Promise<void>((r) => {
                waker = (): void => {
                  waker = null
                  r()
                }
              })
            }
          },
          async return(): Promise<IteratorResult<unknown>> {
            self.postRequest({ kind: 'cancel', reqId })
            self.streams.delete(reqId)
            opts.signal?.removeEventListener('abort', abortHandler)
            return { value: undefined, done: true }
          }
        }
      }
    }
  }

  async dispose(): Promise<void> {
    const proc = this.process
    this.process = null
    this.readyPromise = null
    for (const call of this.calls.values()) {
      call.reject(new Error('provider host disposed'))
    }
    this.calls.clear()
    for (const stream of this.streams.values()) {
      stream.error(new Error('provider host disposed'))
    }
    this.streams.clear()
    proc?.kill()
  }

  private async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      throw new Error('ProviderHost not started — call start() first')
    }
    await this.readyPromise
  }

  private postRequest(req: ChildRequest): void {
    if (!this.process) throw new Error('provider host process not running')
    this.process.postMessage(req)
  }

  private sendRequest(req: ChildRequest & { reqId: string }): Promise<ChildResponse> {
    return new Promise<ChildResponse>((resolve, reject) => {
      this.calls.set(req.reqId, { resolve, reject })
      try {
        this.postRequest(req)
      } catch (err) {
        this.calls.delete(req.reqId)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  private async sendRequestWithCancel(
    req: ChildRequest & { reqId: string },
    reqId: string,
    signal?: AbortSignal
  ): Promise<ChildResponse> {
    const onAbort = (): void => {
      try {
        this.postRequest({ kind: 'cancel', reqId })
      } catch {
        // process may already be down — the call will reject via crash handler
      }
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    try {
      return await this.sendRequest(req)
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private onMessage(msg: ChildResponse): void {
    if (msg.kind === 'ready') {
      this.readyResolver?.()
      this.readyResolver = null
      this.readyRejecter = null
      return
    }
    if (msg.kind === 'instance' || msg.kind === 'result') {
      const call = this.calls.get(msg.reqId)
      if (call) {
        this.calls.delete(msg.reqId)
        call.resolve(msg)
      }
      return
    }
    if (msg.kind === 'error') {
      const call = this.calls.get(msg.reqId)
      if (call) {
        this.calls.delete(msg.reqId)
        call.reject(deserializeError(msg.error))
        return
      }
      this.streams.get(msg.reqId)?.error(deserializeError(msg.error))
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
    this.readyRejecter?.(err)
    this.readyResolver = null
    this.readyRejecter = null
    for (const call of this.calls.values()) call.reject(err)
    this.calls.clear()
    for (const stream of this.streams.values()) stream.error(err)
    this.streams.clear()
    this.process = null
    this.readyPromise = null
    console.error('[provider-host]', err.message)
  }
}

// Replace AbortSignal instances with a sentinel so they can cross structured
// clone. The child re-injects a real signal where the sentinel appears.
function marshalArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof AbortSignal) return { [SIGNAL_SLOT_MARKER]: true }
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      let changed = false
      const out: Record<string, unknown> = {}
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

// For tests only.
export function resetProviderHostSingleton(): void {
  singleton = null
}
