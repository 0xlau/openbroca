import { createPersistedStore } from './create-persisted-store'

export interface AppSettings {
  language: string
  theme: 'light' | 'dark' | 'system'
  debugMode: boolean
}

export const settingsStore = createPersistedStore<AppSettings>({
  key: 'settings',
  defaults: {
    language: 'en',
    theme: 'system',
    debugMode: false
  }
})
