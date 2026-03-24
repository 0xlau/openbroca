import { router } from './trpc'
import { appRouter } from './routers/app'
import { storeRouter } from './routers/store'
import { providersRouter } from './routers/providers'
import { audioRouter } from './routers/audio'

export const appTrpcRouter = router({
  app: appRouter,
  store: storeRouter,
  providers: providersRouter,
  audio: audioRouter
})

export type AppRouter = typeof appTrpcRouter
