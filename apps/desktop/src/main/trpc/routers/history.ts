import { z } from 'zod'
import { toHistoryAudioUrl } from '../../history-audio-protocol'
import { hasMeaningfulText } from '../../../shared/meaningful-text'
import type { VoiceHistoryRecord } from '../../../shared/voice-history'
import { publicProcedure, router } from '../trpc'

const DASHBOARD_TOKEN_WINDOW_DAYS = 7
const MANUAL_TYPING_WPM = 40
const MS_PER_MINUTE = 60_000
const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null

function toAudioFileUrl(record: { id: string; audioFilePath?: string }): string | undefined {
  return record.audioFilePath ? toHistoryAudioUrl(record.id) : undefined
}

function toHistorySummaryViewModel(
  record: Pick<
    VoiceHistoryRecord,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'audioDurationMs'
    | 'finalText'
    | 'failureStage'
    | 'failureMessage'
    | 'asrProviderId'
    | 'llmProviderId'
    | 'audioFilePath'
  >
) {
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

type HistoryStatsRecord = Pick<
  VoiceHistoryRecord,
  'createdAt' | 'status' | 'audioDurationMs' | 'finalText' | 'debug'
>

function toLocalDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function countWords(value: string): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return 0
  }

  if (wordSegmenter) {
    return Array.from(wordSegmenter.segment(trimmed)).reduce((sum, segment) => {
      return segment.isWordLike ? sum + 1 : sum
    }, 0)
  }

  return trimmed.split(/\s+/u).length
}

function buildDailyTokenUsage(records: HistoryStatsRecord[]) {
  const now = new Date()
  const buckets = new Map<string, number>()

  for (let offset = DASHBOARD_TOKEN_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    buckets.set(toLocalDateKey(date), 0)
  }

  for (const record of records) {
    const totalTokens = record.debug.tokenUsage?.totalTokens
    if (typeof totalTokens !== 'number' || !Number.isFinite(totalTokens) || totalTokens < 0) {
      continue
    }

    const bucketKey = toLocalDateKey(record.createdAt)
    if (!buckets.has(bucketKey)) {
      continue
    }

    buckets.set(bucketKey, (buckets.get(bucketKey) ?? 0) + totalTokens)
  }

  return Array.from(buckets.entries()).map(([date, tokens]) => ({
    date,
    dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
    tokens
  }))
}

function toHistoryStats(records: HistoryStatsRecord[]) {
  const eligibleRecords = records
    .filter((record) => record.status === 'completed' && hasMeaningfulText(record.finalText))
    .map((record) => ({
      ...record,
      wordCount: countWords(record.finalText ?? '')
    }))
    .filter((record) => record.wordCount > 0)

  const completedDictations = eligibleRecords.length
  const activeDays = new Set(eligibleRecords.map((record) => toLocalDateKey(record.createdAt))).size
  const totalDictationTimeMs = eligibleRecords.reduce(
    (sum, record) => sum + record.audioDurationMs,
    0
  )
  const wordsDictated = eligibleRecords.reduce(
    (sum, record) => sum + record.wordCount,
    0
  )
  const timeSavedMs = Math.round((wordsDictated / MANUAL_TYPING_WPM) * MS_PER_MINUTE)
  const avgDictationSpeedWpm =
    totalDictationTimeMs > 0
      ? Math.round(wordsDictated / (totalDictationTimeMs / MS_PER_MINUTE))
      : 0

  return {
    dailyTokenUsage: buildDailyTokenUsage(records),
    completedDictations,
    activeDays,
    totalDictationTimeMs,
    wordsDictated,
    timeSavedMs,
    avgDictationSpeedWpm
  }
}

export const historyRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.historyRepository.list().map((record) => toHistorySummaryViewModel(record))
  ),
  stats: publicProcedure.query(({ ctx }) => toHistoryStats(ctx.historyRepository.list())),
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
