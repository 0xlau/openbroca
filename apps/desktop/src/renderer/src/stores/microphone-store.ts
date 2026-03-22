import { createPersistedStore } from './create-persisted-store'

export interface MicrophoneSettings {
  selectedDeviceId: string | null
}

export const microphoneStore = createPersistedStore<MicrophoneSettings>({
  key: 'microphone',
  defaults: { selectedDeviceId: null }
})
