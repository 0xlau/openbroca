import type { ProviderSettings } from '../../shared/provider-auth'

export type { ProviderConnectionRecord, ProviderSettings } from '../../shared/provider-auth'

export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  providers: ProviderSettings
  settings: Record<string, unknown>
  [key: string]: unknown
}
