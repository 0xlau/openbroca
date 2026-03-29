import type { ProviderConnectionMetadata } from '../../shared/provider-auth'

export type { ProviderConnectionMetadata } from '../../shared/provider-auth'

export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  providers: Record<string, ProviderConnectionMetadata>
  settings: Record<string, unknown>
  [key: string]: unknown
}
