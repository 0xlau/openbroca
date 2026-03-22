import { router } from './trpc'
import { appRouter } from './routers/app'
import { storeRouter } from './routers/store'

export const appTrpcRouter = router({
  app: appRouter,
  store: storeRouter
})

export type AppRouter = typeof appTrpcRouter
