import { createPersistedStore } from './create-persisted-store'

export interface ProviderSettings {
  [providerId: string]: {
    apiKey?: string
    baseUrl?: string
    enabled: boolean
  }
}

export const providerStore = createPersistedStore<ProviderSettings>({
  key: 'providers',
  defaults: {}
})
