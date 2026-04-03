import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

const allowedStoreKeys = new Set([
  'aboutMe',
  'dictionary',
  'instructions',
  'providers',
  'settings',
  'microphone',
  'shortcuts'
])

type AllowedStoreKey = (typeof allowedStoreKeys) extends Set<infer Key> ? Key : never

function assertAllowedStoreKey(key: string): asserts key is AllowedStoreKey {
  if (!allowedStoreKeys.has(key)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Store key not allowed: ${key}`
    })
  }
}

export const storeRouter = router({
  get: publicProcedure.input(z.object({ key: z.string() })).query(({ input, ctx }) => {
    assertAllowedStoreKey(input.key)
    return ctx.store.get(input.key) ?? null
  }),

  set: publicProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(({ input, ctx }) => {
      assertAllowedStoreKey(input.key)
      ctx.store.set(input.key, input.value)
    }),

  delete: publicProcedure.input(z.object({ key: z.string() })).mutation(({ input, ctx }) => {
    assertAllowedStoreKey(input.key)
    ctx.store.delete(input.key as keyof typeof ctx.store.store)
  }),

  watch: publicProcedure.input(z.object({ key: z.string() })).subscription(async function* ({
    input,
    ctx,
    signal
  }) {
    assertAllowedStoreKey(input.key)
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
