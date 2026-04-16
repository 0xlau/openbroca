import { describe, expect, test } from 'vitest'
import { toHistoryAudioUrl } from '../../../history-audio-protocol'
import { historyRouter } from '../history'

describe('historyRouter', () => {
  test('lists summary records and returns details with audio file URLs', async () => {
    type HistoryCallerContext = Parameters<typeof historyRouter.createCaller>[0]

    const caller = historyRouter.createCaller({
      historyRepository: {
        list: () => [
          {
            id: 'record-1',
            createdAt: '2026-04-02T10:00:00.000Z',
            updatedAt: '2026-04-02T10:00:00.000Z',
            status: 'completed',
            audioDurationMs: 1000,
            finalText: 'Send the report by Friday.',
            audioFilePath: '/tmp/one.wav',
            failureStage: null,
            debug: {
              rawTranscriptionText: 'send the report by friday',
              asrSegments: [],
              asrRequest: {},
              asrResponseSummary: {},
              llmRequest: {},
              llmResponseSummary: {},
              timeline: [],
              errors: []
            }
          }
        ],
        getById: () => ({
          id: 'record-1',
          createdAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:00:00.000Z',
          status: 'completed',
          audioDurationMs: 1000,
          finalText: 'Send the report by Friday.',
          audioFilePath: '/tmp/one.wav',
          failureStage: null,
          debug: {
            rawTranscriptionText: 'send the report by friday',
            asrSegments: [],
            asrRequest: {},
            asrResponseSummary: {},
            llmRequest: {},
            llmResponseSummary: {},
            timeline: [],
            errors: []
          }
        })
      }
    } as unknown as HistoryCallerContext)

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
})
