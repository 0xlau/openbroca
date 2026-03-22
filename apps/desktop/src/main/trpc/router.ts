import { router } from './trpc'
import { appRouter } from './routers/app'

export const appTrpcRouter = router({
  app: appRouter
})

export type AppRouter = typeof appTrpcRouter
