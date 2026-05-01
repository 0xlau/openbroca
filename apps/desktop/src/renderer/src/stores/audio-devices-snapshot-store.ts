import { createPersistedStore } from './create-persisted-store'
import {
  AUDIO_DEVICES_SNAPSHOT_KEY,
  defaultAudioDevicesSnapshot,
  type AudioDevicesSnapshot
} from '../../../shared/audio-devices'

export const audioDevicesSnapshotStore = createPersistedStore<AudioDevicesSnapshot>({
  key: AUDIO_DEVICES_SNAPSHOT_KEY,
  defaults: defaultAudioDevicesSnapshot
})
