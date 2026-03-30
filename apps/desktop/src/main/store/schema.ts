import type { ProviderConnectionRecord } from '../../shared/provider-auth'

export type { ProviderConnectionRecord } from '../../shared/provider-auth'

export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  providers: Record<string, ProviderConnectionRecord>
  settings: Record<string, unknown>
  [key: string]: unknown
}
