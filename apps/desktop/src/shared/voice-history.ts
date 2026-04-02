export type VoiceHistoryStatus = 'processing' | 'completed' | 'failed'
export type VoiceHistoryFailureStage = 'storage' | 'asr' | 'llm' | 'persistence' | null

export interface VoiceHistoryDebugData {
  rawTranscriptionText: string
  asrSegments: Array<{ text: string; startTime?: number; endTime?: number; isFinal: boolean }>
  asrRequest: Record<string, unknown>
  asrResponseSummary: Record<string, unknown>
  llmRequest: Record<string, unknown>
  llmResponseSummary: Record<string, unknown>
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
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
