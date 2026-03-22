import { publicProcedure, router } from '../trpc'

export const providersRouter = router({
  listLLM: publicProcedure.query(({ ctx }) => {
    return ctx.llmRegistry.listDescriptors().map((d) => ({
      id: d.id,
      displayName: d.displayName,
      description: d.description,
      capabilities: d.capabilities ?? null
    }))
  }),

  listASR: publicProcedure.query(({ ctx }) => {
    return ctx.asrRegistry.listDescriptors().map((d) => ({
      id: d.id,
      displayName: d.displayName,
      description: d.description,
      kind: d.kind
    }))
  })
})
