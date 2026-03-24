import { createPersistedStore } from './create-persisted-store'

export interface MicrophoneSettings {
  /** PortAudio device index — used by Node.js capture in the main process */
  selectedDeviceId: number | null
  /** Browser MediaDeviceInfo.deviceId — used by LiveWaveform in the renderer */
  selectedBrowserDeviceId: string | null
}

export const microphoneStore = createPersistedStore<MicrophoneSettings>({
  key: 'microphone',
  defaults: { selectedDeviceId: null, selectedBrowserDeviceId: null }
})
