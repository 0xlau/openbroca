import { ipcMain, BrowserWindow, type WebContents } from 'electron'
import { callTRPCProcedure, type AnyRouter, type inferRouterContext } from '@trpc/server'
import { isObservable, observableToAsyncIterable } from '@trpc/server/observable'
import superjson from 'superjson'
import { randomUUID } from 'crypto'

type SubscriptionEntry = { controller: AbortController }

const activeSubscriptions = new Map<string, SubscriptionEntry>()

function cleanupSubscriptionsForWebContents(webContents: WebContents): void {
  for (const [id, entry] of activeSubscriptions.entries()) {
    if (id.startsWith(`${webContents.id}:`)) {
      entry.controller.abort()
      activeSubscriptions.delete(id)
    }
  }
}

export function registerTrpcIpcHandler<TRouter extends AnyRouter>(
  trpcRouter: TRouter,
  createContext: (window: BrowserWindow) => inferRouterContext<TRouter>
): void {
  ipcMain.handle('trpc:request', async (event, payload: { path: string; input: unknown }) => {
    const { path, input } = payload
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('No BrowserWindow found for this webContents')

    const ctx = createContext(window)
    const deserialized =
      input !== undefined
        ? superjson.deserialize(input as Parameters<typeof superjson.deserialize>[0])
        : undefined

    const controller = new AbortController()
    try {
      const result = await callTRPCProcedure({
        router: trpcRouter,
        path,
        getRawInput: async () => deserialized,
        ctx,
        type: 'query',
        signal: controller.signal,
        batchIndex: 0
      })
      return { ok: true, data: superjson.serialize(result) }
    } catch (err) {
      return { ok: false, error: superjson.serialize(err) }
    }
  })

  ipcMain.handle(
    'trpc:subscription:start',
    async (event, payload: { path: string; input: unknown }) => {
      const { path, input } = payload
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) throw new Error('No BrowserWindow found for this webContents')

      const ctx = createContext(window)
      const deserialized =
        input !== undefined
          ? superjson.deserialize(input as Parameters<typeof superjson.deserialize>[0])
          : undefined

      const subscriptionId = `${event.sender.id}:${randomUUID()}`
      const controller = new AbortController()
      activeSubscriptions.set(subscriptionId, { controller })

      event.sender.once('destroyed', () => cleanupSubscriptionsForWebContents(event.sender))

      ;(async () => {
        try {
          let result = await callTRPCProcedure({
            router: trpcRouter,
            path,
            getRawInput: async () => deserialized,
            ctx,
            type: 'subscription',
            signal: controller.signal,
            batchIndex: 0
          })

          if (isObservable(result)) {
            result = observableToAsyncIterable(result, controller.signal)
          }

          for await (const chunk of result as AsyncIterable<unknown>) {
            if (controller.signal.aborted || event.sender.isDestroyed()) break
            event.sender.send('trpc:subscription:data', {
              id: subscriptionId,
              type: 'data',
              data: superjson.serialize(chunk)
            })
          }

          if (!controller.signal.aborted && !event.sender.isDestroyed()) {
            event.sender.send('trpc:subscription:data', { id: subscriptionId, type: 'complete' })
          }
        } catch (err) {
          if (!controller.signal.aborted && !event.sender.isDestroyed()) {
            event.sender.send('trpc:subscription:data', {
              id: subscriptionId,
              type: 'error',
              error: superjson.serialize(err)
            })
          }
        } finally {
          activeSubscriptions.delete(subscriptionId)
        }
      })()

      return subscriptionId
    }
  )

  ipcMain.handle('trpc:subscription:stop', (_event, subscriptionId: string) => {
    const entry = activeSubscriptions.get(subscriptionId)
    if (entry) {
      entry.controller.abort()
      activeSubscriptions.delete(subscriptionId)
    }
  })
}
