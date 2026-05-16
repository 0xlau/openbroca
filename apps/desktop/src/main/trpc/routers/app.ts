import { app, shell } from 'electron'
import { z } from 'zod'
import { getSupportLinkUrl } from '../../../shared/support-links'
import { publicProcedure, router } from '../trpc'

export const appRouter = router({
  getAppVersion: publicProcedure.query(() => app.getVersion()),
  getPlatform: publicProcedure.query(() => process.platform),
  openSupportLink: publicProcedure
    .input(z.object({ target: z.enum(['help', 'feedback']) }))
    .mutation(async ({ input }) => {
      await shell.openExternal(getSupportLinkUrl(input.target))
    })
})
