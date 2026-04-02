import { randomUUID } from 'node:crypto'
import {
  defaultVoiceHistoryState,
  type VoiceHistoryDebugData,
  type VoiceHistoryRecord,
  type VoiceHistoryState
} from '../shared/voice-history'

interface HistoryStoreLike {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
}

type VoiceHistoryDebugPatch = Partial<VoiceHistoryDebugData>

export type VoiceHistoryPatch = Partial<
  Omit<VoiceHistoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'debug'>
> & {
  debug?: VoiceHistoryDebugPatch
}

export class HistoryRepository {
  constructor(private readonly store: HistoryStoreLike) {}

  list(): VoiceHistoryRecord[] {
    return [...this.read().records].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
  }

  getById(id: string): VoiceHistoryRecord | undefined {
    return this.read().records.find((record) => record.id === id)
  }

  create(input: Pick<VoiceHistoryRecord, 'status' | 'audioDurationMs' | 'asrProviderId' | 'llmProviderId'>): VoiceHistoryRecord {
    const now = new Date().toISOString()
    const record: VoiceHistoryRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: input.status,
      audioDurationMs: input.audioDurationMs,
      asrProviderId: input.asrProviderId,
      llmProviderId: input.llmProviderId,
      failureStage: null,
      debug: {
        rawTranscriptionText: '',
        asrSegments: [],
        asrRequest: {},
        asrResponseSummary: {},
        llmRequest: {},
        llmResponseSummary: {},
        timeline: [],
        errors: []
      }
    }

    const state = this.read()
    this.write({ records: [record, ...state.records] })
    return record
  }

  update(id: string, patch: VoiceHistoryPatch): VoiceHistoryRecord {
    const state = this.read()
    const nextRecords = state.records.map((record) => {
      if (record.id !== id) {
        return record
      }

      const { debug, ...rest } = patch
      return {
        ...record,
        ...rest,
        debug: debug ? { ...record.debug, ...debug } : record.debug,
        updatedAt: new Date().toISOString()
      }
    })

    const updated = nextRecords.find((record) => record.id === id)
    if (!updated) {
      throw new Error(`Unknown voice history record: ${id}`)
    }

    this.write({ records: nextRecords })
    return updated
  }

  private read(): VoiceHistoryState {
    return this.store.get<VoiceHistoryState>('voiceHistory') ?? defaultVoiceHistoryState
  }

  private write(state: VoiceHistoryState): void {
    this.store.set('voiceHistory', state)
  }
}
