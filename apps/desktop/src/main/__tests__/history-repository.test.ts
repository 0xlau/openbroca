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
    expect(created.debug.frontmostAppSnapshot).toBe(null)
  })

  test('create seeds debug.delivery defaults', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    expect(created.debug.delivery).toEqual({
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
    })
    expect(created.debug.frontmostAppSnapshot).toBe(null)
  })

  test('read backfills debug.delivery for legacy persisted records', () => {
    const legacyRecord = {
      id: 'legacy-record',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      status: 'completed',
      audioDurationMs: 1200,
      failureStage: null,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex',
      debug: {
        rawTranscriptionText: 'legacy text',
        asrSegments: [],
        asrRequest: {},
        asrResponseSummary: {},
        llmRequest: {},
        llmResponseSummary: {},
        timeline: [],
        errors: []
      }
    }
    const store = createStoreStub({
      voiceHistory: { records: [legacyRecord] }
    })
    const repository = new HistoryRepository(store)

    const record = repository.getById('legacy-record') as VoiceHistoryRecord
    const state = store.get<{ records: VoiceHistoryRecord[] }>('voiceHistory')

    expect(record.debug.delivery).toEqual({
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
    })
    expect(record.debug.frontmostAppSnapshot).toBe(null)
    expect(state?.records[0]?.debug.delivery).toEqual({
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
    })
    expect(state?.records[0]?.debug.frontmostAppSnapshot).toBe(null)
  })

  test('read backfills missing structured delivery evidence fields on partially migrated records', () => {
    const partiallyMigratedRecord = {
      id: 'partial-record',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      status: 'completed',
      audioDurationMs: 1200,
      failureStage: null,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex',
      debug: {
        rawTranscriptionText: 'legacy text',
        asrSegments: [],
        asrRequest: {},
        asrResponseSummary: {},
        llmRequest: {},
        llmResponseSummary: {},
        frontmostAppSnapshot: undefined,
        delivery: {
          targetAppAtMatch: {
            bundleId: 'com.openai.chat',
            displayName: 'ChatGPT'
          },
          targetAppAtDelivery: null,
          matchedInstruction: {
            ruleId: 'rule-chat',
            name: 'Chat',
            autoEnterMode: 'enter'
          },
          instructionPromptApplied: true,
          method: 'paste',
          status: 'completed',
          autoSendTriggered: true
        },
        timeline: [],
        errors: []
      }
    }
    const store = createStoreStub({
      voiceHistory: { records: [partiallyMigratedRecord] }
    })
    const repository = new HistoryRepository(store)

    const record = repository.getById('partial-record') as VoiceHistoryRecord

    expect(record.debug.frontmostAppSnapshot).toBe(null)
    expect(record.debug.delivery).toEqual({
      targetAppAtMatch: {
        bundleId: 'com.openai.chat',
        displayName: 'ChatGPT'
      },
      targetAppAtDelivery: null,
      matchedInstruction: {
        ruleId: 'rule-chat',
        name: 'Chat',
        autoEnterMode: 'enter'
      },
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: false,
      method: 'paste',
      status: 'completed',
      outcome: 'paste-success',
      pasteAttempted: true,
      autoSendTriggered: true
    })
  })

  test('read backfills missing delivery flags without inventing contradictory success evidence', () => {
    const partiallyMigratedRecord = {
      id: 'partial-fallback-record',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      status: 'completed',
      audioDurationMs: 1200,
      failureStage: null,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex',
      debug: {
        rawTranscriptionText: 'legacy text',
        asrSegments: [],
        asrRequest: {},
        asrResponseSummary: {},
        llmRequest: {},
        llmResponseSummary: {},
        frontmostAppSnapshot: undefined,
        delivery: {
          targetAppAtMatch: {
            bundleId: 'com.openai.chat',
            displayName: 'ChatGPT'
          },
          matchedInstruction: {
            ruleId: 'rule-chat',
            name: 'Chat',
            autoEnterMode: 'enter'
          },
          status: 'fallback',
          fallbackReason: 'paste-command-failed'
        },
        timeline: [],
        errors: []
      }
    }
    const store = createStoreStub({
      voiceHistory: { records: [partiallyMigratedRecord] }
    })
    const repository = new HistoryRepository(store)

    const record = repository.getById('partial-fallback-record') as VoiceHistoryRecord

    expect(record.debug.delivery).toEqual({
      targetAppAtMatch: {
        bundleId: 'com.openai.chat',
        displayName: 'ChatGPT'
      },
      targetAppAtDelivery: null,
      matchedInstruction: {
        ruleId: 'rule-chat',
        name: 'Chat',
        autoEnterMode: 'enter'
      },
      instructionPromptApplied: false,
      ownershipMatchedAtDelivery: false,
      method: 'pending',
      status: 'fallback',
      outcome: 'clipboard-fallback',
      pasteAttempted: false,
      autoSendTriggered: false,
      fallbackReason: 'paste-command-failed'
    })
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

  test('update normalizes partial delivery patches into a schema-complete delivery object', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    const updated = repository.update(created.id, {
      debug: {
        delivery: {
          method: 'paste',
          status: 'completed',
          instructionPromptApplied: true
        }
      }
    })

    expect(updated.debug.delivery).toEqual({
      targetAppAtMatch: null,
      targetAppAtDelivery: null,
      matchedInstruction: null,
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: false,
      method: 'paste',
      status: 'completed',
      outcome: 'paste-success',
      pasteAttempted: true,
      autoSendTriggered: false
    })
  })

  test('update deep-merges delivery patches and preserves previously normalized fields', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    repository.update(created.id, {
      debug: {
        delivery: {
          method: 'paste',
          status: 'completed',
          instructionPromptApplied: true
        }
      }
    })

    const updated = repository.update(created.id, {
      debug: {
        delivery: {
          status: 'fallback',
          fallbackReason: 'paste-command-failed'
        }
      }
    })

    expect(updated.debug.delivery).toEqual({
      targetAppAtMatch: null,
      targetAppAtDelivery: null,
      matchedInstruction: null,
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: false,
      method: 'paste',
      status: 'fallback',
      outcome: 'clipboard-fallback',
      pasteAttempted: true,
      autoSendTriggered: false,
      fallbackReason: 'paste-command-failed'
    })
  })

  test('update throws when the record id is missing', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    expect(() =>
      repository.update('unknown-id', { status: 'failed' })
    ).toThrowError('Unknown voice history record: unknown-id')
  })

  test('update strips iconDataUrl from frontmostAppSnapshot before persisting', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    repository.update(created.id, {
      debug: {
        frontmostAppSnapshot: {
          id: 'com.openai.chat',
          bundleId: 'com.openai.chat',
          displayName: 'ChatGPT',
          iconDataUrl: 'data:image/png;base64,bloated-payload'
        }
      }
    })

    const stored = store.get<{ records: VoiceHistoryRecord[] }>('voiceHistory')
    const persisted = stored?.records[0]?.debug.frontmostAppSnapshot
    expect(persisted).toEqual({
      id: 'com.openai.chat',
      bundleId: 'com.openai.chat',
      displayName: 'ChatGPT'
    })
    expect(persisted && 'iconDataUrl' in persisted).toBe(false)
  })

  test('update strips iconDataUrl from delivery target apps before persisting', () => {
    const store = createStoreStub({ voiceHistory: { records: [] } })
    const repository = new HistoryRepository(store)

    const created = repository.create({
      status: 'processing',
      audioDurationMs: 1200,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex'
    })

    repository.update(created.id, {
      debug: {
        delivery: {
          targetAppAtMatch: {
            bundleId: 'com.apple.mail',
            displayName: 'Mail',
            iconDataUrl: 'data:image/png;base64,bloated-mail'
          },
          targetAppAtDelivery: {
            bundleId: 'com.openai.chat',
            displayName: 'ChatGPT',
            iconDataUrl: 'data:image/png;base64,bloated-chat'
          },
          method: 'paste',
          status: 'completed'
        }
      }
    })

    const stored = store.get<{ records: VoiceHistoryRecord[] }>('voiceHistory')
    const delivery = stored?.records[0]?.debug.delivery

    expect(delivery?.targetAppAtMatch).toEqual({
      bundleId: 'com.apple.mail',
      displayName: 'Mail'
    })
    expect(delivery?.targetAppAtDelivery).toEqual({
      bundleId: 'com.openai.chat',
      displayName: 'ChatGPT'
    })
    expect(
      delivery?.targetAppAtMatch && 'iconDataUrl' in delivery.targetAppAtMatch
    ).toBe(false)
    expect(
      delivery?.targetAppAtDelivery && 'iconDataUrl' in delivery.targetAppAtDelivery
    ).toBe(false)
  })

  test('read migrates legacy records by stripping bloated iconDataUrl payloads', () => {
    const legacyRecord = {
      id: 'legacy-icon-record',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      status: 'completed',
      audioDurationMs: 1200,
      failureStage: null,
      asrProviderId: 'deepgram',
      llmProviderId: 'openai-codex',
      debug: {
        rawTranscriptionText: 'legacy text',
        asrSegments: [],
        asrRequest: {},
        asrResponseSummary: {},
        llmRequest: {},
        llmResponseSummary: {},
        frontmostAppSnapshot: {
          bundleId: 'com.apple.mail',
          displayName: 'Mail',
          iconDataUrl: 'data:image/png;base64,legacy-bloat'
        },
        delivery: {
          targetAppAtMatch: {
            bundleId: 'com.openai.chat',
            displayName: 'ChatGPT',
            iconDataUrl: 'data:image/png;base64,legacy-chat'
          },
          targetAppAtDelivery: {
            bundleId: 'com.openai.chat',
            displayName: 'ChatGPT',
            iconDataUrl: 'data:image/png;base64,legacy-delivery'
          },
          matchedInstruction: null,
          instructionPromptApplied: false,
          ownershipMatchedAtDelivery: false,
          method: 'paste',
          status: 'completed',
          outcome: 'paste-success',
          pasteAttempted: true,
          autoSendTriggered: false
        },
        timeline: [],
        errors: []
      }
    }
    const store = createStoreStub({ voiceHistory: { records: [legacyRecord] } })
    const repository = new HistoryRepository(store)

    repository.list()

    const persistedRecord = store.get<{ records: VoiceHistoryRecord[] }>('voiceHistory')?.records[0]
    expect(persistedRecord?.debug.frontmostAppSnapshot).toEqual({
      bundleId: 'com.apple.mail',
      displayName: 'Mail'
    })
    expect(persistedRecord?.debug.delivery.targetAppAtMatch).toEqual({
      bundleId: 'com.openai.chat',
      displayName: 'ChatGPT'
    })
    expect(persistedRecord?.debug.delivery.targetAppAtDelivery).toEqual({
      bundleId: 'com.openai.chat',
      displayName: 'ChatGPT'
    })
  })
})
