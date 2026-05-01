import { z } from 'zod'
import { resolveLLMProvider } from '../../providers/runtime'
import { resolveASRSetupStatus, resolveLLMSetupStatus } from '../../providers/setup-status'
import {
  cancelLocalInstall,
  changeLocalModelDirectory,
  getLocalModelState,
  installLocalModel,
  removeLocalModel,
  selectLocalModel,
  type MutableStoreLike
} from '../../providers/local-models'
import { publicProcedure, router } from '../trpc'

const localModelsRouter = router({
  getState: publicProcedure
    .input(z.object({ providerId: z.string() }))
    .query(({ ctx, input }) =>
      getLocalModelState({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId
      })
    ),

  select: publicProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      selectLocalModel({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId,
        modelId: input.modelId
      })
      return getLocalModelState({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId
      })
    }),

  install: publicProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .subscription(async function* ({ ctx, input, signal }) {
      const iterator = installLocalModel({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId,
        modelId: input.modelId
      })

      // If the renderer-side subscription is cancelled (window close,
      // user-initiated abort), forward that to the install controller.
      const onAbort = () => cancelLocalInstall(input.providerId)
      signal?.addEventListener('abort', onAbort)
      try {
        for await (const event of iterator) {
          if (signal?.aborted) break
          yield event
        }
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    }),

  cancelInstall: publicProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(({ input }) => {
      cancelLocalInstall(input.providerId)
    }),

  remove: publicProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await removeLocalModel({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId,
        modelId: input.modelId
      })
      return getLocalModelState({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId
      })
    }),

  changeDirectory: publicProcedure
    .input(z.object({ providerId: z.string(), modelDir: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      changeLocalModelDirectory({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId,
        modelDir: input.modelDir
      })
      return getLocalModelState({
        asrRegistry: ctx.asrRegistry,
        store: ctx.store as unknown as MutableStoreLike,
        providerId: input.providerId
      })
    })
})

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
  }),

  localModels: localModelsRouter
})
