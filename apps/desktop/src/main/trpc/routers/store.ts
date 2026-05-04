import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { normalizeAboutMeSettings } from '../../../shared/about-me'
import { normalizeDictionarySettings } from '../../../shared/dictionary'
import { normalizeInstructionsSettings } from '../../../shared/instructions'
import { normalizePromptTemplateSettings } from '../../../shared/prompt-template'
import { publicProcedure, router } from '../trpc'

const allowedStoreKeys = [
  'aboutMe',
  'dictionary',
  'instructions',
  'prompts',
  'providers',
  'settings',
  'microphone',
  'shortcuts',
  'onboarding'
] as const

type AllowedStoreKey = (typeof allowedStoreKeys)[number]
const allowedStoreKeySet = new Set<AllowedStoreKey>(allowedStoreKeys)

function assertAllowedStoreKey(key: string): asserts key is AllowedStoreKey {
  if (!allowedStoreKeySet.has(key as AllowedStoreKey)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Store key not allowed: ${key}`
    })
  }
}

function normalizeStoreValue(key: AllowedStoreKey, value: unknown): unknown {
  if (key === 'instructions') {
    return normalizeInstructionsSettings(value)
  }

  if (key === 'aboutMe') {
    return normalizeAboutMeSettings(value)
  }

  if (key === 'dictionary') {
    return normalizeDictionarySettings(value)
  }

  if (key === 'prompts') {
    return normalizePromptTemplateSettings(value)
  }

  return value
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
      ctx.store.set(input.key, normalizeStoreValue(input.key, input.value))
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
          if (signal?.aborted) {
            break
          }

          await new Promise<void>((resolve) => {
            const cleanup = () => {
              notify = null
              signal?.removeEventListener('abort', onAbort)
            }

            const onAbort = () => {
              cleanup()
              resolve()
            }

            notify = () => {
              cleanup()
              resolve()
            }

            signal?.addEventListener('abort', onAbort, { once: true })
          })
        }
      }
    } finally {
      unsubscribe()
    }
  })
})
