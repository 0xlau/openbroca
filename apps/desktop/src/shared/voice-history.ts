export type VoiceHistoryStatus = 'processing' | 'completed' | 'failed'
export type VoiceHistoryFailureStage = 'storage' | 'asr' | 'llm' | 'persistence' | null

export type VoiceHistoryDeliveryDebug = {
  targetAppAtMatch: Record<string, unknown> | null
  targetAppAtDelivery: Record<string, unknown> | null
  matchedInstruction: {
    ruleId: string
    name: string
    autoEnterMode: 'off' | 'enter' | 'mod-enter'
  } | null
  instructionPromptApplied: boolean
  ownershipMatchedAtDelivery: boolean
  method: 'pending' | 'paste' | 'clipboard'
  status: 'pending' | 'completed' | 'fallback' | 'failed'
  outcome: 'pending' | 'paste-success' | 'clipboard-fallback' | 'delivery-failed'
  pasteAttempted: boolean
  autoSendTriggered: boolean
  failureMessage?: string
  fallbackReason?:
    | 'target-not-resolved'
    | 'paste-command-failed'
    | 'clipboard-write-failed'
    | 'service-unavailable'
}

export interface VoiceHistoryDebugData {
  rawTranscriptionText: string
  asrSegments: Array<{ text: string; startTime?: number; endTime?: number; isFinal: boolean }>
  asrRequest: Record<string, unknown>
  asrResponseSummary: Record<string, unknown>
  llmRequest: Record<string, unknown>
  llmResponseSummary: Record<string, unknown>
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  frontmostAppSnapshot?: Record<string, unknown> | null
  delivery: VoiceHistoryDeliveryDebug
  timeline: Array<{
    stage: 'storage' | 'asr' | 'llm'
    status: 'started' | 'completed' | 'failed'
    at: string
    message?: string
  }>
  errors: Array<{ stage: Exclude<VoiceHistoryFailureStage, null>; message: string; at: string }>
}

export interface VoiceHistoryRecord {
  id: string
  createdAt: string
  updatedAt: string
  status: VoiceHistoryStatus
  audioFilePath?: string
  audioDurationMs: number
  finalText?: string
  failureStage: VoiceHistoryFailureStage
  failureMessage?: string
  asrProviderId?: string
  llmProviderId?: string
  debug: VoiceHistoryDebugData
}

export interface VoiceHistoryState {
  records: VoiceHistoryRecord[]
}

export const defaultVoiceHistoryState: VoiceHistoryState = {
  records: []
}
