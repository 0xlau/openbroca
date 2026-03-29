import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

export const providerAuthRouter = router({
  status: publicProcedure
    .input(
      z.object({
        providerId: z.string()
      })
    )
    .query(({ ctx, input }) => {
      return ctx.oauthService.getStatus(input.providerId)
    })
})
