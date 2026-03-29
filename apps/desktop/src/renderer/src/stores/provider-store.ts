import type { ProviderConnectionType } from '@openbroca/providers'
import type { ProviderConnectionMetadata } from '../../../shared/provider-auth'
import { createPersistedStore } from './create-persisted-store'

export interface ManualProviderConnectionRecord {
  enabled: boolean
  connectionType: Exclude<ProviderConnectionType, 'oauth'>
  config?: Record<string, string>
}

export type ProviderConnectionRecord = ManualProviderConnectionRecord | ProviderConnectionMetadata

export interface ProviderSettings {
  [providerId: string]: ProviderConnectionRecord | undefined
}

export const providerStore = createPersistedStore<ProviderSettings>({
  key: 'providers',
  defaults: {}
})
