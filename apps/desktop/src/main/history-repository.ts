import { randomUUID } from 'node:crypto'
import {
  defaultVoiceHistoryState,
  type VoiceHistoryDeliveryDebug,
  type VoiceHistoryDebugData,
  type VoiceHistoryRecord,
  type VoiceHistoryState
} from '../shared/voice-history'

interface HistoryStoreLike {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
}

type VoiceHistoryDebugPatch = Omit<Partial<VoiceHistoryDebugData>, 'delivery'> & {
  delivery?: Partial<VoiceHistoryDeliveryDebug>
}

export type VoiceHistoryPatch = Partial<
  Omit<VoiceHistoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'debug'>
> & {
  debug?: VoiceHistoryDebugPatch
}

function createDefaultDeliveryDebug(): VoiceHistoryDeliveryDebug {
  return {
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
  }
}

function normalizeDeliveryDebug(
  value: Partial<VoiceHistoryDeliveryDebug> | null | undefined
): VoiceHistoryDeliveryDebug {
  const defaults = createDefaultDeliveryDebug()

  if (!value) {
    return defaults
  }

  const normalizedMethod =
    value.method === 'paste' || value.method === 'clipboard' || value.method === 'pending'
      ? value.method
      : typeof value.method === 'string' && value.method === 'ax-direct'
        ? 'paste'
        : defaults.method
  const normalizedStatus = value.status ?? defaults.status
  const normalizedTargetAppAtDelivery = value.targetAppAtDelivery ?? null
  const normalizedFallbackReason = value.fallbackReason
  const derivedOutcome =
    normalizedStatus === 'completed'
      ? normalizedMethod === 'paste'
        ? 'paste-success'
        : defaults.outcome
      : normalizedStatus === 'fallback'
        ? 'clipboard-fallback'
        : normalizedStatus === 'failed'
          ? 'delivery-failed'
          : defaults.outcome
  const isOutcomeCoherent =
    value.outcome === derivedOutcome ||
    (value.outcome === 'pending' && normalizedStatus === 'pending')
  const normalizedOutcome =
    value.outcome == null || !isOutcomeCoherent
      ? derivedOutcome
      : value.outcome
  const derivedPasteAttempted =
    normalizedMethod === 'paste' || normalizedOutcome === 'paste-success'
  const normalizedPasteAttempted =
    derivedPasteAttempted ? true : value.pasteAttempted ?? defaults.pasteAttempted
  const normalizedInstructionPromptApplied = value.instructionPromptApplied ?? defaults.instructionPromptApplied
  const normalizedOwnershipMatchedAtDelivery =
    value.ownershipMatchedAtDelivery ?? defaults.ownershipMatchedAtDelivery

  const normalized: VoiceHistoryDeliveryDebug = {
    targetAppAtMatch: stripAppIcon(value.targetAppAtMatch ?? null),
    targetAppAtDelivery: stripAppIcon(normalizedTargetAppAtDelivery),
    matchedInstruction: value.matchedInstruction ?? null,
    instructionPromptApplied: normalizedInstructionPromptApplied,
    ownershipMatchedAtDelivery: normalizedOwnershipMatchedAtDelivery,
    method: normalizedMethod,
    status: normalizedStatus,
    outcome: normalizedOutcome,
    pasteAttempted: normalizedPasteAttempted,
    autoSendTriggered: value.autoSendTriggered ?? defaults.autoSendTriggered,
    ...(typeof value.failureMessage === 'string' ? { failureMessage: value.failureMessage } : {}),
    ...(typeof normalizedFallbackReason === 'string'
      ? { fallbackReason: normalizedFallbackReason }
      : {})
  }

  const hasIdenticalShape =
    normalized.targetAppAtMatch === value.targetAppAtMatch &&
    normalized.targetAppAtDelivery === value.targetAppAtDelivery &&
    normalized.matchedInstruction === value.matchedInstruction &&
    normalized.instructionPromptApplied === value.instructionPromptApplied &&
    normalized.ownershipMatchedAtDelivery === value.ownershipMatchedAtDelivery &&
    normalized.method === value.method &&
    normalized.status === value.status &&
    normalized.outcome === value.outcome &&
    normalized.pasteAttempted === value.pasteAttempted &&
    normalized.autoSendTriggered === value.autoSendTriggered &&
    normalized.failureMessage === value.failureMessage &&
    normalized.fallbackReason === value.fallbackReason

  return hasIdenticalShape ? (value as VoiceHistoryDeliveryDebug) : normalized
}

function stripAppIcon<T extends Record<string, unknown> | null | undefined>(app: T): T {
  // History records embed app icons (base64 PNG data URLs) that bloat the
  // electron-store JSON file by 100s of KB per record. The renderer never
  // reads icons from history records — only live target-app icons in the
  // floating window — so dropping them here keeps the store small enough
  // for the synchronous writeFileSync path to stay under any noticeable
  // main-thread stall.
  if (!app || typeof app !== 'object' || !('iconDataUrl' in app)) {
    return app
  }
  const rest = { ...app }
  delete rest.iconDataUrl
  return rest as T
}

function normalizeFrontmostAppSnapshot(value: VoiceHistoryDebugData['frontmostAppSnapshot']) {
  return stripAppIcon(value ?? null)
}

function normalizeDebugData(debug: VoiceHistoryDebugData): VoiceHistoryDebugData {
  const normalizedDelivery = normalizeDeliveryDebug(debug.delivery)
  const normalizedFrontmostAppSnapshot = normalizeFrontmostAppSnapshot(debug.frontmostAppSnapshot)

  if (
    normalizedDelivery === debug.delivery &&
    normalizedFrontmostAppSnapshot === debug.frontmostAppSnapshot
  ) {
    return debug
  }

  return {
    ...debug,
    frontmostAppSnapshot: normalizedFrontmostAppSnapshot,
    delivery: normalizedDelivery
  }
}

function normalizeRecord(record: VoiceHistoryRecord): VoiceHistoryRecord {
  const normalizedDebug = normalizeDebugData(record.debug)

  if (normalizedDebug === record.debug) {
    return record
  }

  return {
    ...record,
    debug: normalizedDebug
  }
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
        frontmostAppSnapshot: null,
        delivery: createDefaultDeliveryDebug(),
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
      const nextDebug = debug
        ? normalizeDebugData({
            ...record.debug,
            ...debug,
            delivery: debug.delivery
              ? {
                  ...record.debug.delivery,
                  ...debug.delivery
                }
              : record.debug.delivery
          })
        : record.debug

      return {
        ...record,
        ...rest,
        debug: nextDebug,
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
    const state = this.store.get<VoiceHistoryState>('voiceHistory') ?? defaultVoiceHistoryState
    let mutated = false
    const records = state.records.map((record) => {
      const normalized = normalizeRecord(record)
      if (normalized !== record) {
        mutated = true
      }
      return normalized
    })

    if (!mutated) {
      return state
    }

    const normalizedState = { records }
    this.write(normalizedState)
    return normalizedState
  }

  private write(state: VoiceHistoryState): void {
    this.store.set('voiceHistory', state)
  }
}
