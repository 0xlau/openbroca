import { describe, expect, test } from 'vitest'
import { HistoryRepository } from '../history-repository'
import type { VoiceHistoryRecord } from '../../shared/voice-history'

function createStoreStub(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get<T>(key: string): T | undefined {
      return data.get(key) as T | undefined
    },
    set(key: string, value: unknown) {
      data.set(key, value)
    }
  }
}

describe('HistoryRepository', () => {
  test('creates, updates, lists, and fetches detailed records', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    repository.update(created.id, {
      status: 'completed',
      finalText: 'Send the report by Friday.',
      audioFilePath:
        '/Users/example/Library/Application Support/openbroca/recordings/one.wav',
      debug: {
        rawTranscriptionText: 'send the report by friday',
        asrSegments: [],
        asrRequest: { language: 'en' },
        asrResponseSummary: { segmentCount: 1 },
        llmRequest: { model: 'gpt-5.2-codex' },
        llmResponseSummary: { finishReason: 'stop' },
        tokenUsage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
        timeline: [],
        errors: []
      }
    })

    const listed = repository.list()
    const detailed = repository.getById(created.id) as VoiceHistoryRecord

    expect(listed).toHaveLength(1)
    expect(listed[0]?.finalText).toBe('Send the report by Friday.')
    expect(detailed.debug.rawTranscriptionText).toBe('send the report by friday')
    expect(detailed.status).toBe('completed')
  })

  test('create initializes failure stage and default debug payload', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    expect(created.failureStage).toBe(null)
    expect(created.debug.rawTranscriptionText).toBe('')
    expect(created.debug.asrSegments).toEqual([])
    expect(created.debug.timeline).toEqual([])
    expect(created.debug.errors).toEqual([])
  })

  test('update refreshes updatedAt', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    const staleTimestamp = '2000-01-01T00:00:00.000Z'
    const state = store.get<{ records: VoiceHistoryRecord[] }>('voiceHistory')
    if (state) {
      state.records[0].updatedAt = staleTimestamp
      store.set('voiceHistory', state)
    }

    const updated = repository.update(created.id, {
      status: 'completed',
      finalText: 'Send the report by Friday.'
    })

    expect(updated.updatedAt).not.toBe(staleTimestamp)
  })

  test('update merges partial debug payload without wiping fields', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    const updated = repository.update(created.id, {
      status: 'completed',
      debug: {
        rawTranscriptionText: 'send it now'
      }
    })

    expect(updated.debug.rawTranscriptionText).toBe('send it now')
    expect(updated.debug.asrRequest).toEqual({})
    expect(updated.debug.errors).toEqual([])
  })

  test('update throws when the record id is missing', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    expect(() =>
      repository.update('unknown-id', { status: 'failed' })
    ).toThrowError('Unknown voice history record: unknown-id')
  })
})
