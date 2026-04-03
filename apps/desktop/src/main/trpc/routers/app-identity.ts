import { publicProcedure, router } from '../trpc'

export const appIdentityRouter = router({
  listApps: publicProcedure.query(({ ctx }) => ctx.appIdentityService.listApps()),
  frontmost: publicProcedure.query(({ ctx }) => ctx.appIdentityService.getFrontmostApp())
})
