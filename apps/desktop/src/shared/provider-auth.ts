import type { ProviderConnectionType } from '@openbroca/providers'

export interface ProviderAuthAccount {
  email?: string
  accountId?: string
}

export interface ProviderAuthConnectionMetadata {
  status: 'connected'
  lastConnectedAt: string
}

export interface ProviderConnectionMetadata {
  enabled: boolean
  connectionType: 'oauth'
  account?: ProviderAuthAccount
  auth?: ProviderAuthConnectionMetadata
  [key: string]: unknown
}

export interface ManualProviderConnectionRecord {
  enabled: boolean
  connectionType: Exclude<ProviderConnectionType, 'oauth'>
  config?: Record<string, string>
}

export type ProviderConnectionRecord = ManualProviderConnectionRecord | ProviderConnectionMetadata

export interface ConnectedProviderAuthState {
  providerId: string
  status: 'connected'
  account?: ProviderAuthAccount
  lastConnectedAt: string
}

export interface DisconnectedProviderAuthState {
  providerId: string
  status: 'not-connected'
}

export type ProviderAuthState = ConnectedProviderAuthState | DisconnectedProviderAuthState

export function createConnectedProviderMetadata(
  account: ProviderAuthAccount | undefined,
  lastConnectedAt: string,
  existing: Partial<ProviderConnectionMetadata> = {}
): ProviderConnectionMetadata {
  return {
    ...existing,
    enabled: true,
    connectionType: 'oauth',
    account,
    auth: {
      status: 'connected',
      lastConnectedAt
    }
  }
}

export function toProviderAuthState(
  providerId: string,
  metadata?: ProviderConnectionMetadata
): ProviderAuthState {
  if (metadata?.auth?.status === 'connected') {
    return {
      providerId,
      status: 'connected',
      account: metadata.account,
      lastConnectedAt: metadata.auth.lastConnectedAt
    }
  }

  return {
    providerId,
    status: 'not-connected'
  }
}
