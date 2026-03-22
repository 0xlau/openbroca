import { createPersistedStore } from './create-persisted-store'

export interface ShortcutSettings {
  floatingWindowAccelerator: string
}

export const shortcutsStore = createPersistedStore<ShortcutSettings>({
  key: 'shortcuts',
  defaults: {
    floatingWindowAccelerator: 'CommandOrControl+Shift+Space'
  }
})
