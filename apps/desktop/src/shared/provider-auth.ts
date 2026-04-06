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
  providerSettings: Record<string, Record<string, unknown> | undefined>
  activeProviders: ActiveProviders
}

export const defaultProviderSettings: ProviderSettings = {
  providers: {},
  providerSettings: {},
  activeProviders: {}
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

function normalizeModel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const model = value.trim()
  if (!model) {
    return null
  }
  return model
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
  const hadProviderSettings = hasOwnRecord(settings.providerSettings, providerId)
  const activeProviderRemoved =
    settings.activeProviders.llm === providerId || settings.activeProviders.asr === providerId

  const nextProviders = hadProvider ? { ...settings.providers } : settings.providers
  if (hadProvider) {
    delete nextProviders[providerId]
  }

  const nextProviderSettings = hadProviderSettings
    ? { ...settings.providerSettings }
    : settings.providerSettings
  if (hadProviderSettings) {
    delete nextProviderSettings[providerId]
  }

  const nextActiveProviders = activeProviderRemoved
    ? clearActiveProviderSelections(settings.activeProviders, providerId)
    : settings.activeProviders

  return {
    providers: nextProviders,
    providerSettings: nextProviderSettings,
    activeProviders: nextActiveProviders
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
  const rawProviderSettings = isRecord(raw.providerSettings)
    ? (raw.providerSettings as Record<string, unknown>)
    : {}
  const rawProviderModels = isRecord(raw.providerModels)
    ? (raw.providerModels as Record<string, unknown>)
    : {}

  const activeProviders: ActiveProviders = {}
  const providerSettings: Record<string, Record<string, unknown> | undefined> = {}

  if (typeof rawActiveProviders.llm === 'string' && hasOwnRecord(providers, rawActiveProviders.llm)) {
    activeProviders.llm = rawActiveProviders.llm
  }
  if (typeof rawActiveProviders.asr === 'string' && hasOwnRecord(providers, rawActiveProviders.asr)) {
    activeProviders.asr = rawActiveProviders.asr
  }

  for (const [providerId, rawSettings] of Object.entries(rawProviderSettings)) {
    if (!hasOwnRecord(providers, providerId) || !isRecord(rawSettings)) {
      continue
    }

    const nextSettings: Record<string, unknown> = { ...rawSettings }
    if (Object.prototype.hasOwnProperty.call(nextSettings, 'model')) {
      const model = normalizeModel(nextSettings.model)
      if (model) {
        nextSettings.model = model
      } else {
        delete nextSettings.model
      }
    }

    if (Object.keys(nextSettings).length === 0) {
      continue
    }

    providerSettings[providerId] = nextSettings
  }

  for (const [providerId, selection] of Object.entries(rawProviderModels)) {
    if (!hasOwnRecord(providers, providerId) || !isRecord(selection)) {
      continue
    }

    const model = normalizeModel(selection.model)
    if (!model) {
      continue
    }

    const existing = providerSettings[providerId]
    if (!existing) {
      providerSettings[providerId] = { model }
      continue
    }

    // Legacy backfill should never overwrite the new shape when a valid model is already present.
    const existingModel = normalizeModel(existing.model)
    if (existingModel) {
      continue
    }

    providerSettings[providerId] = { ...existing, model }
  }

  return {
    providers,
    providerSettings,
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
