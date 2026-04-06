import { z } from 'zod'
import { resolveLLMProvider } from '../../providers/runtime'
import { resolveASRSetupStatus, resolveLLMSetupStatus } from '../../providers/setup-status'
import { publicProcedure, router } from '../trpc'

export const providersRouter = router({
  listLLM: publicProcedure.query(({ ctx }) => {
    return ctx.llmRegistry.listDescriptors().map((d) => ({
      id: d.id,
      displayName: d.displayName,
      description: d.description,
      icon: d.icon ?? null,
      capabilities: d.capabilities ?? null,
      connectionOptions: d.connectionOptions ?? [],
      settingsItems: d.settingsItems ?? []
    }))
  }),

  getSetupStatus: publicProcedure
    .input(
      z.object({
        providerId: z.string(),
        kind: z.enum(['llm', 'asr'])
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.kind === 'llm') {
        return resolveLLMSetupStatus(input.providerId, {
          llmRegistry: ctx.llmRegistry,
          store: ctx.store
        })
      }

      return resolveASRSetupStatus(input.providerId, {
        asrRegistry: ctx.asrRegistry,
        store: ctx.store
      })
    }),

  listModels: publicProcedure
    .input(
      z.object({
        providerId: z.string()
      })
    )
    .query(async ({ ctx, input }) => {
      const provider = await resolveLLMProvider(input.providerId, {
        llmRegistry: ctx.llmRegistry,
        oauthService: ctx.oauthService,
        store: ctx.store
      })
      return provider.listModels()
    }),

  listASR: publicProcedure.query(({ ctx }) => {
    return ctx.asrRegistry.listDescriptors().map((d) => ({
      id: d.id,
      displayName: d.displayName,
      description: d.description,
      icon: d.icon ?? null,
      kind: d.kind,
      capabilities: ctx.asrRegistry.getCapabilities(d.id),
      connectionOptions: d.connectionOptions ?? [],
      settingsItems: d.settingsItems ?? []
    }))
  })
})
