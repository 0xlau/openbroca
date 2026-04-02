import { ConfigurationError } from '@openbroca/providers'
import type { ASRProvider, ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProvider, LLMProviderRegistry } from '@openbroca/providers/llm'
import type { OAuthService } from '../auth/oauth-service'
import { normalizeProviderSettings, type ProviderConnectionRecord } from '../../shared/provider-auth'

interface StoreLike {
  get<T>(key: string): T | undefined
}

interface LLMProviderRuntimeDeps {
  llmRegistry: LLMProviderRegistry
  oauthService: OAuthService
  store: StoreLike
}

interface ASRProviderRuntimeDeps {
  asrRegistry: ASRProviderRegistry
  store: StoreLike
}

function getProviderRecords(store: StoreLike): Record<string, ProviderConnectionRecord | undefined> {
  return normalizeProviderSettings(store.get<unknown>('providers')).providers
}

export function getActiveLLMProviderId(store: StoreLike): string | undefined {
  return normalizeProviderSettings(store.get<unknown>('providers')).activeProviders.llm
}

export function getActiveASRProviderId(store: StoreLike): string | undefined {
  return normalizeProviderSettings(store.get<unknown>('providers')).activeProviders.asr
}

export async function resolveActiveASRProvider(deps: ASRProviderRuntimeDeps): Promise<ASRProvider> {
  const providerId = getActiveASRProviderId(deps.store)
  if (!providerId) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active ASR provider before processing a recording.'
    )
  }

  const providers = getProviderRecords(deps.store)
  const provider = providers[providerId]
  if (!provider?.enabled) {
    throw new ConfigurationError(providerId, 'Provider is not configured')
  }

  return deps.asrRegistry.resolve(providerId, provider.config ?? {})
}

export async function getLLMProviderRuntimeConfig(
  providerId: string,
  { oauthService, store }: LLMProviderRuntimeDeps
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
  deps: LLMProviderRuntimeDeps
): Promise<LLMProvider> {
  const config = await getLLMProviderRuntimeConfig(providerId, deps)
  await deps.llmRegistry.evict(providerId)
  return deps.llmRegistry.resolve(providerId, config)
}

export async function resolveActiveLLMProvider(deps: LLMProviderRuntimeDeps): Promise<LLMProvider> {
  const providerId = getActiveLLMProviderId(deps.store)
  if (!providerId) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active LLM provider before requesting runtime access.'
    )
  }

  return resolveLLMProvider(providerId, deps)
}

export async function selectFirstLLMModel(provider: LLMProvider): Promise<string> {
  const models = await provider.listModels()
  const modelId = models[0]?.id
  if (!modelId) {
    throw new ConfigurationError(provider.id, 'Provider did not return any models')
  }
  return modelId
}
