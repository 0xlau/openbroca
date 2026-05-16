import { publicProcedure, router } from '../trpc'
import type { AppUpdateState } from '../../../shared/app-update'

export const updatesRouter = router({
  getState: publicProcedure.query(({ ctx }) => ctx.updateService.getState()),

  check: publicProcedure.mutation(({ ctx }) => ctx.updateService.checkForUpdates()),

  install: publicProcedure.mutation(({ ctx }) => ctx.updateService.installUpdate()),

  watch: publicProcedure.subscription(async function* ({ ctx, signal }) {
    const queue: AppUpdateState[] = [ctx.updateService.getState()]
    let notify: (() => void) | null = null

    const unsubscribe = ctx.updateService.subscribe((state) => {
      queue.push(state)
      notify?.()
      notify = null
    })

    try {
      while (!signal?.aborted) {
        if (queue.length > 0) {
          const state = queue.shift()
          if (state) {
            yield state
          }
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
