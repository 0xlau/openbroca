import { ConfigurationError } from '@openbroca/providers'
import type { LLMProvider, LLMProviderRegistry } from '@openbroca/providers/llm'
import type { OAuthService } from '../auth/oauth-service'
import type { ProviderConnectionRecord } from '../../shared/provider-auth'

interface StoreLike {
  get<T>(key: string): T | undefined
}

interface ProviderRuntimeDeps {
  llmRegistry: LLMProviderRegistry
  oauthService: OAuthService
  store: StoreLike
}

function getProviderRecords(store: StoreLike): Record<string, ProviderConnectionRecord> {
  return store.get<Record<string, ProviderConnectionRecord>>('providers') ?? {}
}

export async function getLLMProviderRuntimeConfig(
  providerId: string,
  { oauthService, store }: ProviderRuntimeDeps
): Promise<unknown> {
  const providers = getProviderRecords(store)
  const provider = providers[providerId]

  if (!provider?.enabled) {
    throw new ConfigurationError(providerId, 'Provider is not configured')
  }

  if (provider.connectionType === 'oauth') {
    const oauthConfig = await oauthService.getRuntimeConfig(providerId)
    if (!oauthConfig) {
      throw new ConfigurationError(providerId, 'OAuth provider is not configured')
    }

    return oauthConfig
  }

  return provider.config ?? {}
}

export async function resolveLLMProvider(
  providerId: string,
  deps: ProviderRuntimeDeps
): Promise<LLMProvider> {
  const config = await getLLMProviderRuntimeConfig(providerId, deps)
  await deps.llmRegistry.evict(providerId)
  return deps.llmRegistry.resolve(providerId, config)
}
