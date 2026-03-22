import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

export const storeRouter = router({
  get: publicProcedure.input(z.object({ key: z.string() })).query(({ input, ctx }) => {
    return ctx.store.get(input.key) ?? null
  }),

  set: publicProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(({ input, ctx }) => {
      ctx.store.set(input.key, input.value)
    }),

  delete: publicProcedure.input(z.object({ key: z.string() })).mutation(({ input, ctx }) => {
    ctx.store.delete(input.key as keyof typeof ctx.store.store)
  }),

  watch: publicProcedure.input(z.object({ key: z.string() })).subscription(async function* ({
    input,
    ctx,
    signal
  }) {
    const queue: unknown[] = []
    let notify: (() => void) | null = null

    const unsubscribe = ctx.store.onDidChange(
      input.key as keyof typeof ctx.store.store,
      (newValue) => {
        queue.push(newValue ?? null)
        notify?.()
        notify = null
      }
    )

    try {
      while (!signal?.aborted) {
        if (queue.length > 0) {
          yield queue.shift()
        } else {
          await new Promise<void>((resolve) => {
            notify = resolve
            signal?.addEventListener('abort', () => resolve(), { once: true })
          })
        }
      }
    } finally {
      unsubscribe()
    }
  })
})
