import type { InstructionsSettings } from '../../shared/instructions'
import type { ProviderSettings } from '../../shared/provider-auth'
import type { VoiceHistoryState } from '../../shared/voice-history'

export type { ProviderConnectionRecord, ProviderSettings } from '../../shared/provider-auth'

export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  instructions: InstructionsSettings
  providers: ProviderSettings
  settings: Record<string, unknown>
  voiceHistory: VoiceHistoryState
  [key: string]: unknown
}
