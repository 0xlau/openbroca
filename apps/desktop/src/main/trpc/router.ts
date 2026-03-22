import { router } from './trpc'
import { appRouter } from './routers/app'
import { storeRouter } from './routers/store'
import { providersRouter } from './routers/providers'

export const appTrpcRouter = router({
  app: appRouter,
  store: storeRouter,
  providers: providersRouter
})

export type AppRouter = typeof appTrpcRouter
