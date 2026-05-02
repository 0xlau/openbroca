import { afterEach, describe, expect, test, vi } from 'vitest'
import { toHistoryAudioUrl } from '../../../history-audio-protocol'
import type {
  VoiceHistoryDebugData,
  VoiceHistoryRecord
} from '../../../../shared/voice-history'
import { historyRouter } from '../history'

type CreateRecordOverrides = Partial<Omit<VoiceHistoryRecord, 'debug'>> & {
  debug?: Partial<VoiceHistoryDebugData>
}

type HistoryCallerContext = Parameters<typeof historyRouter.createCaller>[0]

const FIXED_NOW = new Date(2026, 3, 22, 10, 0, 0, 0)

const defaultDebug = {
  rawTranscriptionText: 'send the report by friday',
  asrSegments: [],
  asrRequest: {},
  asrResponseSummary: {},
  llmRequest: {},
  llmResponseSummary: {},
  frontmostAppSnapshot: null,
  delivery: {
    targetAppAtMatch: null,
    targetAppAtDelivery: null,
    matchedInstruction: null,
    instructionPromptApplied: false,
    ownershipMatchedAtDelivery: false,
    method: 'pending',
    status: 'pending',
    outcome: 'pending',
    pasteAttempted: false,
    autoSendTriggered: false
  },
  timeline: [],
  errors: []
} satisfies VoiceHistoryRecord['debug']

function createRecord(overrides: CreateRecordOverrides = {}): VoiceHistoryRecord {
  const { debug, ...restOverrides } = overrides

  return {
    id: 'record-default',
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    status: 'completed',
    audioDurationMs: 1000,
    finalText: 'Send the report by Friday.',
    failureStage: null,
    ...restOverrides,
    debug: {
      ...defaultDebug,
      ...debug
    }
  }
}

function createCaller(records: VoiceHistoryRecord[]): ReturnType<typeof historyRouter.createCaller> {
  return historyRouter.createCaller({
    historyRepository: {
      list: () => records,
      getById: (id: string) => records.find((record) => record.id === id)
    }
  } as unknown as HistoryCallerContext)
}

function toLocalIsoString(dayOfMonth: number, hour = 10): string {
  return new Date(2026, 3, dayOfMonth, hour, 0, 0, 0).toISOString()
}

function toLocalIsoStringAt(dayOfMonth: number, hour: number, minute: number): string {
  return new Date(2026, 3, dayOfMonth, hour, minute, 0, 0).toISOString()
}

function toDayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

describe('historyRouter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('lists summary records and returns details with audio file URLs', async () => {
    const record = createRecord({
      id: 'record-1',
      audioFilePath: '/tmp/one.wav'
    })
    const caller = createCaller([record])

    const list = await caller.list()
    const detail = await caller.getById({ id: 'record-1' })

    const expectedUrl = toHistoryAudioUrl('record-1')
    expect(list[0]?.audioFileUrl).toBe(expectedUrl)

    expect(detail).not.toBeNull()
    if (!detail) {
      throw new Error('Expected detail record to be returned')
    }

    expect(detail.audioFileUrl).toBe(expectedUrl)
    expect('audioFilePath' in detail).toBe(false)
    expect(detail.debug.rawTranscriptionText).toBe('send the report by friday')
  })

  test('returns 7 local-day token buckets with zero-filled gaps and aggregates eligible stats', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const caller = createCaller([
      createRecord({
        id: 'outside-window-completed',
        createdAt: toLocalIsoString(15),
        updatedAt: toLocalIsoString(15),
        audioDurationMs: 2000,
        finalText: 'six seven eight',
        debug: {
          tokenUsage: { promptTokens: 90, completionTokens: 9, totalTokens: 99 }
        }
      }),
      createRecord({
        id: 'day-16-completed',
        createdAt: toLocalIsoString(16),
        updatedAt: toLocalIsoString(16),
        audioDurationMs: 2000,
        finalText: 'alpha beta',
        debug: {
          tokenUsage: { promptTokens: 6, completionTokens: 4, totalTokens: 10 }
        }
      }),
      createRecord({
        id: 'day-18-failed',
        createdAt: toLocalIsoString(18),
        updatedAt: toLocalIsoString(18),
        status: 'failed',
        audioDurationMs: 1000,
        finalText: 'failed text ignored',
        failureStage: 'llm',
        debug: {
          tokenUsage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
        }
      }),
      createRecord({
        id: 'day-20-completed-no-tokens',
        createdAt: toLocalIsoString(20),
        updatedAt: toLocalIsoString(20),
        audioDurationMs: 1000,
        finalText: '  three   four five  '
      }),
      createRecord({
        id: 'day-21-processing',
        createdAt: toLocalIsoString(21),
        updatedAt: toLocalIsoString(21),
        status: 'processing',
        audioDurationMs: 1000,
        finalText: 'processing words ignored',
        debug: {
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      }),
      createRecord({
        id: 'day-22-empty-text',
        createdAt: toLocalIsoString(22),
        updatedAt: toLocalIsoString(22),
        audioDurationMs: 2000,
        finalText: '   ',
        debug: {
          tokenUsage: { promptTokens: 4, completionTokens: 3, totalTokens: 7 }
        }
      })
    ])

    const stats = await caller.stats()

    expect(stats.dailyTokenUsage).toEqual([
      { date: '2026-04-16', dayLabel: toDayLabel('2026-04-16'), tokens: 10 },
      { date: '2026-04-17', dayLabel: toDayLabel('2026-04-17'), tokens: 0 },
      { date: '2026-04-18', dayLabel: toDayLabel('2026-04-18'), tokens: 5 },
      { date: '2026-04-19', dayLabel: toDayLabel('2026-04-19'), tokens: 0 },
      { date: '2026-04-20', dayLabel: toDayLabel('2026-04-20'), tokens: 0 },
      { date: '2026-04-21', dayLabel: toDayLabel('2026-04-21'), tokens: 15 },
      { date: '2026-04-22', dayLabel: toDayLabel('2026-04-22'), tokens: 7 }
    ])
    expect(stats.totalDictationTimeMs).toBe(5000)
    expect(stats.wordsDictated).toBe(8)
    expect(stats.timeSavedMs).toBe(12000)
    expect(stats.avgDictationSpeedWpm).toBe(96)
    expect(stats.completedDictations).toBe(3)
    expect(stats.activeDays).toBe(3)
  })

  test('returns zeros when there are no eligible records', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const caller = createCaller([
      createRecord({
        id: 'failed-no-tokens',
        createdAt: toLocalIsoString(22),
        updatedAt: toLocalIsoString(22),
        status: 'failed',
        finalText: '   ',
        failureStage: 'llm'
      })
    ])

    const stats = await caller.stats()

    expect(stats.dailyTokenUsage).toEqual([
      { date: '2026-04-16', dayLabel: toDayLabel('2026-04-16'), tokens: 0 },
      { date: '2026-04-17', dayLabel: toDayLabel('2026-04-17'), tokens: 0 },
      { date: '2026-04-18', dayLabel: toDayLabel('2026-04-18'), tokens: 0 },
      { date: '2026-04-19', dayLabel: toDayLabel('2026-04-19'), tokens: 0 },
      { date: '2026-04-20', dayLabel: toDayLabel('2026-04-20'), tokens: 0 },
      { date: '2026-04-21', dayLabel: toDayLabel('2026-04-21'), tokens: 0 },
      { date: '2026-04-22', dayLabel: toDayLabel('2026-04-22'), tokens: 0 }
    ])
    expect(stats.totalDictationTimeMs).toBe(0)
    expect(stats.wordsDictated).toBe(0)
    expect(stats.timeSavedMs).toBe(0)
    expect(stats.avgDictationSpeedWpm).toBe(0)
    expect(stats.completedDictations).toBe(0)
    expect(stats.activeDays).toBe(0)
  })

  test('counts non-whitespace-delimited text in summary metrics', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const caller = createCaller([
      createRecord({
        id: 'zh-completed',
        createdAt: toLocalIsoString(22),
        updatedAt: toLocalIsoString(22),
        audioDurationMs: 60_000,
        finalText: '今天天气很好'
      })
    ])

    const stats = await caller.stats()

    expect(stats.wordsDictated).toBe(3)
    expect(stats.timeSavedMs).toBe(4500)
    expect(stats.avgDictationSpeedWpm).toBe(3)
    expect(stats.completedDictations).toBe(1)
    expect(stats.activeDays).toBe(1)
  })

  test('buckets token usage by local day near midnight instead of UTC date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const caller = createCaller([
      createRecord({
        id: 'late-night',
        createdAt: toLocalIsoStringAt(21, 23, 30),
        updatedAt: toLocalIsoStringAt(21, 23, 30),
        debug: {
          tokenUsage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 }
        }
      }),
      createRecord({
        id: 'after-midnight',
        createdAt: toLocalIsoStringAt(22, 0, 30),
        updatedAt: toLocalIsoStringAt(22, 0, 30),
        debug: {
          tokenUsage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 }
        }
      })
    ])

    const stats = await caller.stats()

    expect(stats.dailyTokenUsage).toEqual([
      { date: '2026-04-16', dayLabel: toDayLabel('2026-04-16'), tokens: 0 },
      { date: '2026-04-17', dayLabel: toDayLabel('2026-04-17'), tokens: 0 },
      { date: '2026-04-18', dayLabel: toDayLabel('2026-04-18'), tokens: 0 },
      { date: '2026-04-19', dayLabel: toDayLabel('2026-04-19'), tokens: 0 },
      { date: '2026-04-20', dayLabel: toDayLabel('2026-04-20'), tokens: 0 },
      { date: '2026-04-21', dayLabel: toDayLabel('2026-04-21'), tokens: 4 },
      { date: '2026-04-22', dayLabel: toDayLabel('2026-04-22'), tokens: 6 }
    ])
  })

  test('does not count punctuation-only or emoji-only completed text as words', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const caller = createCaller([
      createRecord({
        id: 'punctuation-only',
        createdAt: toLocalIsoString(22),
        updatedAt: toLocalIsoString(22),
        audioDurationMs: 60_000,
        finalText: '!!!'
      }),
      createRecord({
        id: 'emoji-only',
        createdAt: toLocalIsoString(22),
        updatedAt: toLocalIsoString(22),
        audioDurationMs: 30_000,
        finalText: '🙂🙂'
      })
    ])

    const stats = await caller.stats()

    expect(stats.wordsDictated).toBe(0)
    expect(stats.timeSavedMs).toBe(0)
    expect(stats.avgDictationSpeedWpm).toBe(0)
    expect(stats.completedDictations).toBe(0)
    expect(stats.activeDays).toBe(0)
  })
})
