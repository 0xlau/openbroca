import type { ProviderOAuthConnectionOption } from './oauth.ts'

export type { ProviderOAuthConnectionOption } from './oauth.ts'

export type ProviderConnectionFieldInput = 'text' | 'password' | 'url' | 'directory'

export interface ProviderConnectionField {
  key: string
  label: string
  input: ProviderConnectionFieldInput
  placeholder?: string
  description?: string
  required?: boolean
  advanced?: boolean
}

export interface ProviderApiKeyConnectionOption {
  type: 'apiKey'
  label: string
  description?: string
  fields: ProviderConnectionField[]
}

export interface ProviderLocalConnectionOption {
  type: 'local'
  label: string
  description?: string
  fields: ProviderConnectionField[]
}

export type ProviderConnectionOption =
  | ProviderApiKeyConnectionOption
  | ProviderOAuthConnectionOption
  | ProviderLocalConnectionOption

export type ProviderConnectionType = ProviderConnectionOption['type']
