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

export interface ActiveModels {
  llm?: string
}

export interface ProviderModelSelection {
  model: string
}

export interface ProviderSettings {
  providers: Record<string, ProviderConnectionRecord | undefined>
  providerModels: Record<string, ProviderModelSelection | undefined>
  activeProviders: ActiveProviders
  activeModels: ActiveModels
}

export const defaultProviderSettings: ProviderSettings = {
  providers: {},
  providerModels: {},
  activeProviders: {},
  activeModels: {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwnRecord<T>(
  records: Record<string, T | undefined>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(records, key)
}

export function clearActiveProviderSelections(
  activeProviders: ActiveProviders,
  providerId: string
): ActiveProviders {
  const llmChanged = activeProviders.llm === providerId
  const asrChanged = activeProviders.asr === providerId
  if (!llmChanged && !asrChanged) {
    return activeProviders
  }

  const next: ActiveProviders = {}

  if (activeProviders.llm && !llmChanged) {
    next.llm = activeProviders.llm
  }
  if (activeProviders.asr && !asrChanged) {
    next.asr = activeProviders.asr
  }

  return next
}

export function removeProviderState(
  settings: ProviderSettings,
  providerId: string
): ProviderSettings {
  const hadProvider = hasOwnRecord(settings.providers, providerId)
  const hadProviderModel = hasOwnRecord(settings.providerModels, providerId)
  const activeProviderRemoved =
    settings.activeProviders.llm === providerId || settings.activeProviders.asr === providerId

  const nextProviders = hadProvider ? { ...settings.providers } : settings.providers
  if (hadProvider) {
    delete nextProviders[providerId]
  }

  const nextProviderModels = hadProviderModel ? { ...settings.providerModels } : settings.providerModels
  if (hadProviderModel) {
    delete nextProviderModels[providerId]
  }

  const nextActiveProviders = activeProviderRemoved
    ? clearActiveProviderSelections(settings.activeProviders, providerId)
    : settings.activeProviders

  const shouldClearActiveModel = !nextActiveProviders.llm && typeof settings.activeModels.llm === 'string'
  const nextActiveModels = shouldClearActiveModel ? { ...settings.activeModels } : settings.activeModels
  if (shouldClearActiveModel) {
    delete nextActiveModels.llm
  }

  return {
    providers: nextProviders,
    providerModels: nextProviderModels,
    activeProviders: nextActiveProviders,
    activeModels: nextActiveModels
  }
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
  const rawProviderModels = isRecord(raw.providerModels)
    ? (raw.providerModels as Record<string, unknown>)
    : {}
  const providerModels: Record<string, ProviderModelSelection | undefined> = {}
  const rawActiveModels = isRecord(raw.activeModels)
    ? (raw.activeModels as ActiveModels)
    : {}

  const activeProviders: ActiveProviders = {}
  const activeModels: ActiveModels = {}

  if (typeof rawActiveProviders.llm === 'string' && hasOwnRecord(providers, rawActiveProviders.llm)) {
    activeProviders.llm = rawActiveProviders.llm
  }
  if (typeof rawActiveProviders.asr === 'string' && hasOwnRecord(providers, rawActiveProviders.asr)) {
    activeProviders.asr = rawActiveProviders.asr
  }
  for (const [providerId, selection] of Object.entries(rawProviderModels)) {
    if (!hasOwnRecord(providers, providerId) || !isRecord(selection)) {
      continue
    }
    if (typeof selection.model !== 'string' || !selection.model.trim()) {
      continue
    }
    providerModels[providerId] = { model: selection.model }
  }
  if (activeProviders.llm && typeof rawActiveModels.llm === 'string' && rawActiveModels.llm.trim()) {
    activeModels.llm = rawActiveModels.llm
  }

  return {
    providers,
    providerModels,
    activeProviders,
    activeModels
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
