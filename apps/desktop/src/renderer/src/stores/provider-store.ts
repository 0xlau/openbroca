import type {
  ManualProviderConnectionRecord,
  ProviderConnectionRecord
} from '../../../shared/provider-auth'
import { createPersistedStore } from './create-persisted-store'

export type { ManualProviderConnectionRecord, ProviderConnectionRecord }

export interface ProviderSettings {
  [providerId: string]: ProviderConnectionRecord | undefined
}

export const providerStore = createPersistedStore<ProviderSettings>({
  key: 'providers',
  defaults: {}
})
