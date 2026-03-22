import { publicProcedure, router } from '../trpc'

export const providersRouter = router({
  listLLM: publicProcedure.query(({ ctx }) => {
    return ctx.llmRegistry.listDescriptors().map((d) => ({
      id: d.id,
      displayName: d.displayName,
      description: d.description,
      icon: d.icon ?? null,
      capabilities: d.capabilities ?? null
    }))
  }),

  listASR: publicProcedure.query(({ ctx }) => {
    return ctx.asrRegistry.listDescriptors().map((d) => ({
      id: d.id,
      displayName: d.displayName,
      description: d.description,
      icon: d.icon ?? null,
      kind: d.kind
    }))
  })
})
