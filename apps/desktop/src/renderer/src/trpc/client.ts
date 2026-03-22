import { observable } from '@trpc/server/observable'
import { TRPCClientError, type TRPCLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '../../../main/trpc/router'

type SubscriptionDataMsg = {
  id: string
  type: 'data' | 'complete' | 'error'
  data?: ReturnType<typeof superjson.serialize>
  error?: ReturnType<typeof superjson.serialize>
}

export function ipcLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const { type, path, input } = op
        const serializedInput = input !== undefined ? superjson.serialize(input) : undefined

        if (type === 'subscription') {
          let subscriptionId: string | undefined

          const unsub = window.trpc.onSubscriptionData((raw) => {
            const msg = raw as SubscriptionDataMsg
            if (msg.id !== subscriptionId) return

            if (msg.type === 'data') {
              observer.next({ result: { data: superjson.deserialize(msg.data!) } })
            } else if (msg.type === 'complete') {
              observer.complete()
            } else if (msg.type === 'error') {
              observer.error(TRPCClientError.from(superjson.deserialize(msg.error!) as Error))
            }
          })

          window.trpc
            .subscriptionStart({ path, input: serializedInput })
            .then((id) => {
              subscriptionId = id
              observer.next({ result: { type: 'started' } })
            })
            .catch((err) => observer.error(TRPCClientError.from(err)))

          const cleanup = () => {
            unsub()
            if (subscriptionId) window.trpc.subscriptionStop(subscriptionId)
          }

          return () => cleanup()
        }

        // query / mutation
        window.trpc
          .request({ path, input: serializedInput })
          .then((raw) => {
            const res = raw as
              | { ok: true; data: ReturnType<typeof superjson.serialize> }
              | { ok: false; error: ReturnType<typeof superjson.serialize> }

            if (res.ok) {
              observer.next({ result: { data: superjson.deserialize(res.data) } })
              observer.complete()
            } else {
              observer.error(TRPCClientError.from(superjson.deserialize(res.error) as Error))
            }
          })
          .catch((err) => observer.error(TRPCClientError.from(err)))

        return () => {}
      })
}
