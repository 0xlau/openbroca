import { ConfigurationError } from '@openbroca/providers'
import type { OAuthAuthorizer, OAuthTokens } from './openai-codex-oauth'
import type { SecureStorage } from './secure-storage'
import {
  createConnectedProviderMetadata,
  normalizeProviderSettings,
  removeProviderState,
  toProviderAuthState,
  type ConnectedProviderAuthState,
  type ProviderAuthState,
  type ProviderConnectionMetadata,
  type ProviderConnectionRecord,
  type ProviderSettings
} from '../../shared/provider-auth'

interface StoreLike {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
}

export interface OAuthServiceOptions {
  providers: Record<string, OAuthAuthorizer>
  secureStorage: SecureStorage
  store: StoreLike
  now?: () => Date
}

export class OAuthService {
  private readonly now: () => Date

  constructor(private readonly options: OAuthServiceOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async start(providerId: string): Promise<ConnectedProviderAuthState> {
    const provider = this.options.providers[providerId]
    if (!provider) {
      throw new Error(`OAuth provider "${providerId}" is not registered`)
    }

    const session = await provider.authorize()
    const lastConnectedAt = this.now().toISOString()

    await this.options.secureStorage.setSecret(
      `provider:${providerId}`,
      JSON.stringify(session.tokens)
    )

    const settings = this.getProviderSettings()
    const existingRecord = settings.providers[providerId]
    const existing =
      existingRecord?.connectionType === 'oauth'
        ? (existingRecord as Partial<ProviderConnectionMetadata>)
        : undefined

    this.options.store.set('providers', {
      ...settings,
      providers: {
        ...settings.providers,
        [providerId]: createConnectedProviderMetadata(session.account, lastConnectedAt, existing)
      }
    })

    return {
      providerId,
      status: 'connected',
      account: session.account,
      lastConnectedAt
    }
  }

  async disconnect(providerId: string): Promise<ProviderAuthState> {
    this.ensureProviderRegistered(providerId)

    await this.options.secureStorage.deleteSecret(`provider:${providerId}`)

    const rawSettings = this.options.store.get<unknown>('providers')
    const settings = normalizeProviderSettings(rawSettings)
    const nextSettings = removeProviderState(settings, providerId)
    const settingsChanged =
      nextSettings.providers !== settings.providers ||
      nextSettings.providerModels !== settings.providerModels ||
      nextSettings.activeProviders !== settings.activeProviders ||
      nextSettings.activeModels !== settings.activeModels
    const shouldPersistRawModelCleanup =
      this.hasRawProviderModel(rawSettings, providerId) ||
      this.hasStaleRawActiveModel(rawSettings, providerId, settings)
    if (settingsChanged || shouldPersistRawModelCleanup) {
      this.options.store.set('providers', nextSettings)
    }

    return toProviderAuthState(providerId)
  }

  async getStatus(providerId: string): Promise<ProviderAuthState> {
    this.ensureProviderRegistered(providerId)

    const providers = this.getProviderRecords()
    const provider = providers[providerId]
    if (provider?.connectionType === 'oauth' && provider.auth?.status === 'connected') {
      const secret = await this.getStoredTokens(providerId)
      if (!secret) {
        this.clearProviderRecord(providerId, providers)
        return toProviderAuthState(providerId)
      }

      return toProviderAuthState(providerId, provider)
    }

    return toProviderAuthState(providerId)
  }

  async dispose(): Promise<void> {
    await Promise.all(
      Object.values(this.options.providers).map(async (provider) => {
        await provider.dispose?.()
      })
    )
  }

  private ensureProviderRegistered(providerId: string): OAuthAuthorizer {
    const provider = this.options.providers[providerId]
    if (!provider) {
      throw new Error(`OAuth provider "${providerId}" is not registered`)
    }

    return provider
  }

  async getRuntimeConfig(
    providerId: string
  ): Promise<{ accessToken: string; accountId?: string } | null> {
    this.ensureProviderRegistered(providerId)

    const providers = this.getProviderRecords()
    const provider = providers[providerId]
    if (!provider || provider.connectionType !== 'oauth') {
      return null
    }

    const tokens = await this.getStoredTokens(providerId)
    if (!tokens?.accessToken) {
      this.clearProviderRecord(providerId, providers)
      return null
    }

    return {
      accessToken: tokens.accessToken,
      accountId: provider.account?.accountId
    }
  }

  private getProviderSettings(): ProviderSettings {
    return normalizeProviderSettings(this.options.store.get<unknown>('providers'))
  }

  private hasRawProviderModel(rawSettings: unknown, providerId: string): boolean {
    if (!isRecord(rawSettings) || !isRecord(rawSettings.providerModels)) {
      return false
    }

    return Object.prototype.hasOwnProperty.call(rawSettings.providerModels, providerId)
  }

  private hasStaleRawActiveModel(
    rawSettings: unknown,
    providerId: string,
    normalizedSettings: ProviderSettings
  ): boolean {
    if (!isRecord(rawSettings) || !isRecord(rawSettings.activeModels)) {
      return false
    }

    const rawLlmModel = rawSettings.activeModels.llm
    if (typeof rawLlmModel !== 'string' || rawLlmModel.trim().length === 0) {
      return false
    }

    const rawActiveProviders = isRecord(rawSettings.activeProviders)
      ? (rawSettings.activeProviders as Record<string, unknown>)
      : null
    const rawActiveLlm = rawActiveProviders?.llm

    if (rawActiveLlm === providerId) {
      return true
    }

    return typeof normalizedSettings.activeModels.llm !== 'string'
  }

  private getProviderRecords(): Record<string, ProviderConnectionRecord | undefined> {
    return this.getProviderSettings().providers
  }

  private clearProviderRecord(
    providerId: string,
    providers: Record<string, ProviderConnectionRecord | undefined>
  ): void {
    if (!(providerId in providers)) {
      return
    }

    const settings = this.getProviderSettings()
    this.options.store.set('providers', removeProviderState(settings, providerId))
  }

  private async getStoredTokens(providerId: string): Promise<OAuthTokens | null> {
    const secret = await this.options.secureStorage.getSecret(`provider:${providerId}`)
    if (!secret) {
      return null
    }

    try {
      return JSON.parse(secret) as OAuthTokens
    } catch (error) {
      throw new ConfigurationError(providerId, `Stored OAuth tokens are invalid: ${String(error)}`)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
