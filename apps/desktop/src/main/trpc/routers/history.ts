import { z } from 'zod'
import { toHistoryAudioUrl } from '../../history-audio-protocol'
import { publicProcedure, router } from '../trpc'

function toAudioFileUrl(record: { id: string; audioFilePath?: string }): string | undefined {
  return record.audioFilePath ? toHistoryAudioUrl(record.id) : undefined
}

function toHistorySummaryViewModel(record: {
  id: string
  createdAt: string
  updatedAt: string
  status: string
  audioDurationMs: number
  finalText?: string
  failureStage: unknown
  failureMessage?: string
  asrProviderId?: string
  llmProviderId?: string
  audioFilePath?: string
}) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    audioDurationMs: record.audioDurationMs,
    finalText: record.finalText,
    failureStage: record.failureStage,
    failureMessage: record.failureMessage,
    asrProviderId: record.asrProviderId,
    llmProviderId: record.llmProviderId,
    audioFileUrl: toAudioFileUrl(record)
  }
}

export const historyRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.historyRepository.list().map((record) => toHistorySummaryViewModel(record))
  ),
  getById: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const record = ctx.historyRepository.getById(input.id)
    if (!record) {
      return null
    }

    // Return a renderer-facing view model: never expose filesystem paths.
    return {
      ...toHistorySummaryViewModel(record),
      debug: record.debug
    }
  })
})
