import { app } from 'electron'
import { publicProcedure, router } from '../trpc'

export const appRouter = router({
  getAppVersion: publicProcedure.query(() => app.getVersion()),
  getPlatform: publicProcedure.query(() => process.platform)
})
