export type ProviderOAuthFlow = 'systemBrowser'

export interface ProviderOAuthConnectionOption {
  type: 'oauth'
  label: string
  description?: string
  buttonLabel?: string
  flow: ProviderOAuthFlow
  scopes?: string[]
}

export interface ProviderSecureStorageOption {
  type: 'secureStorage'
  key: string
}
