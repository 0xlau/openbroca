export const AUDIO_DEVICES_SNAPSHOT_KEY = 'audioDevicesSnapshot'

export interface AudioDeviceSnapshotEntry {
  /** PortAudio device index — used by Node-side capture */
  portAudioId: number
  /** Resolved browser MediaDeviceInfo.deviceId, or null if no browser match */
  browserDeviceId: string | null
  /** Display label — clean browser label when matched, else best-effort PortAudio name */
  label: string
  isDefault: boolean
}

export interface AudioDevicesSnapshot {
  devices: AudioDeviceSnapshotEntry[]
}

export const defaultAudioDevicesSnapshot: AudioDevicesSnapshot = {
  devices: []
}
