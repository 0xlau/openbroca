import type { ChildInit, ChildRequest, ChildResponse } from '../protocol'
import { ChildDispatcher } from './dispatcher'
import { createChildRegistries } from './registries'

// Electron's utilityProcess wires `process.parentPort` as a duplex
// MessagePortMain. We avoid the worker_threads `parentPort` entirely; the two
// have different shapes and using the wrong one would silently fail.
interface ParentPortLike {
  on(
    event: 'message',
    listener: (event: { data: ChildRequest | ChildInit }) => void
  ): unknown
  postMessage(msg: ChildResponse): void
  start?(): void
}

const parentPort = (process as unknown as { parentPort: ParentPortLike }).parentPort
parentPort.start?.()

let dispatcher: ChildDispatcher | null = null

parentPort.on('message', (event) => {
  const msg = event.data
  if (msg.kind === 'init') {
    if (dispatcher) return
    const registries = createChildRegistries({ defaultModelDir: msg.defaultModelDir })
    dispatcher = new ChildDispatcher(registries, (response) => parentPort.postMessage(response))
    parentPort.postMessage({ kind: 'ready' })
    return
  }
  if (!dispatcher) {
    // Pre-init request: shouldn't happen if main awaits 'ready', but stay safe.
    return
  }
  void dispatcher.handle(msg)
})
