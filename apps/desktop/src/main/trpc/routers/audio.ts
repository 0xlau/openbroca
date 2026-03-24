import { publicProcedure, router } from '../trpc'

export const audioRouter = router({
  listDevices: publicProcedure.query(({ ctx }) => {
    return ctx.captureSource.listDevices()
  })
})
