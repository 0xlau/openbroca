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

export interface ActiveProviders {
  llm?: string
  asr?: string
}

export interface ProviderSettings {
  providers: Record<string, ProviderConnectionRecord | undefined>
  activeProviders: ActiveProviders
}

export const defaultProviderSettings: ProviderSettings = {
  providers: {},
  activeProviders: {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasProviderRecord(
  providers: Record<string, ProviderConnectionRecord | undefined>,
  providerId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(providers, providerId)
}

export function clearActiveProviderSelections(
  activeProviders: ActiveProviders,
  providerId: string
): ActiveProviders {
  const next: ActiveProviders = {}

  if (activeProviders.llm && activeProviders.llm !== providerId) {
    next.llm = activeProviders.llm
  }
  if (activeProviders.asr && activeProviders.asr !== providerId) {
    next.asr = activeProviders.asr
  }

  return next
}

export function normalizeProviderSettings(raw: unknown): ProviderSettings {
  if (!isRecord(raw)) {
    return defaultProviderSettings
  }

  const providers = isRecord(raw.providers)
    ? ({ ...raw.providers } as Record<string, ProviderConnectionRecord | undefined>)
    : ({ ...raw } as Record<string, ProviderConnectionRecord | undefined>)

  const rawActiveProviders = isRecord(raw.activeProviders)
    ? (raw.activeProviders as ActiveProviders)
    : {}

  const activeProviders: ActiveProviders = {}

  if (typeof rawActiveProviders.llm === 'string' && hasProviderRecord(providers, rawActiveProviders.llm)) {
    activeProviders.llm = rawActiveProviders.llm
  }
  if (typeof rawActiveProviders.asr === 'string' && hasProviderRecord(providers, rawActiveProviders.asr)) {
    activeProviders.asr = rawActiveProviders.asr
  }

  return {
    providers,
    activeProviders
  }
}

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
