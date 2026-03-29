import type { OAuthAuthorizer } from './openai-codex-oauth'
import type { SecureStorage } from './secure-storage'
import {
  createConnectedProviderMetadata,
  toProviderAuthState,
  type ConnectedProviderAuthState,
  type ProviderAuthState,
  type ProviderConnectionMetadata
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

    const providers =
      this.options.store.get<Record<string, ProviderConnectionMetadata>>('providers') ?? {}
    const existing = providers[providerId]
    this.options.store.set('providers', {
      ...providers,
      [providerId]: createConnectedProviderMetadata(session.account, lastConnectedAt, existing)
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

    const providers =
      this.options.store.get<Record<string, ProviderConnectionMetadata>>('providers') ?? {}
    if (providerId in providers) {
      const nextProviders = { ...providers }
      delete nextProviders[providerId]
      this.options.store.set('providers', nextProviders)
    }

    return toProviderAuthState(providerId)
  }

  async getStatus(providerId: string): Promise<ProviderAuthState> {
    this.ensureProviderRegistered(providerId)

    const providers =
      this.options.store.get<Record<string, ProviderConnectionMetadata>>('providers') ?? {}
    const provider = providers[providerId]
    if (provider?.auth?.status === 'connected') {
      const secret = await this.options.secureStorage.getSecret(`provider:${providerId}`)
      if (!secret) {
        const nextProviders = { ...providers }
        delete nextProviders[providerId]
        this.options.store.set('providers', nextProviders)
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
}
