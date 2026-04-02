import { router } from './trpc'
import { appRouter } from './routers/app'
import { storeRouter } from './routers/store'
import { providersRouter } from './routers/providers'
import { audioRouter } from './routers/audio'
import { providerAuthRouter } from './routers/provider-auth'
import { historyRouter } from './routers/history'

export const appTrpcRouter = router({
  app: appRouter,
  store: storeRouter,
  providers: providersRouter,
  audio: audioRouter,
  providerAuth: providerAuthRouter,
  history: historyRouter
})

export type AppRouter = typeof appTrpcRouter
