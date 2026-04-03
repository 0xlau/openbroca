import ElectronStore from 'electron-store'
import { defaultInstructionsSettings } from '../../shared/instructions'
import { defaultProviderSettings } from '../../shared/provider-auth'
import { defaultVoiceHistoryState } from '../../shared/voice-history'
import type { StoreSchema } from './schema'

const Store: typeof ElectronStore =
  (ElectronStore as unknown as { default?: typeof ElectronStore }).default ?? ElectronStore

export const store = new Store<StoreSchema>({
  name: 'openbroca',
  defaults: {
    aboutMe: {},
    dictionary: {},
    instructions: defaultInstructionsSettings,
    providers: defaultProviderSettings,
    settings: {},
    voiceHistory: defaultVoiceHistoryState
  }
})
