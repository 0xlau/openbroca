import type {
  ProviderSettings,
  ManualProviderConnectionRecord,
  ProviderConnectionRecord
} from '../../../shared/provider-auth'
import { defaultProviderSettings, normalizeProviderSettings } from '../../../shared/provider-auth'
import { createPersistedStore } from './create-persisted-store'

export type { ManualProviderConnectionRecord, ProviderConnectionRecord, ProviderSettings }

export const providerStore = createPersistedStore<ProviderSettings>({
  key: 'providers',
  defaults: defaultProviderSettings,
  normalize: normalizeProviderSettings
})
