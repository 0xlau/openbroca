import { ConfigurationError } from '@openbroca/providers'
import type { ASRProvider, ASRProviderDescriptor, ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProvider, LLMProviderRegistry } from '@openbroca/providers/llm'
import type { OAuthService } from '../auth/oauth-service'
import { normalizeProviderSettings, type ProviderConnectionRecord } from '../../shared/provider-auth'

export interface StoreLike {
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

export interface ActiveASRSelection {
  provider: ASRProvider
  settings: Record<string, unknown>
}

export interface ActiveLLMSelection {
  providerId: string
  model: string
}

export function getNormalizedProviderSettings(store: StoreLike) {
  return normalizeProviderSettings(store.get<unknown>('providers'))
}

function getProviderRecords(store: StoreLike): Record<string, ProviderConnectionRecord | undefined> {
  return getNormalizedProviderSettings(store).providers
}

export function getActiveLLMProviderId(store: StoreLike): string | undefined {
  return getNormalizedProviderSettings(store).activeProviders.llm
}

export function getActiveASRProviderId(store: StoreLike): string | undefined {
  return getNormalizedProviderSettings(store).activeProviders.asr
}

export function getActiveASRSelectedModelId(store: StoreLike): string | undefined {
  const settings = getNormalizedProviderSettings(store)
  const providerId = settings.activeProviders.asr
  const providerSettings = providerId ? settings.providerSettings[providerId] : undefined
  const value = providerSettings?.selectedModelId
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const model = value.trim()
  return model ? model : undefined
}

export function getActiveLLMModel(store: StoreLike): string | undefined {
  const settings = getNormalizedProviderSettings(store)
  const providerId = settings.activeProviders.llm
  if (!providerId) {
    return undefined
  }
  const providerSettings = settings.providerSettings[providerId]
  return providerSettings ? normalizeModel(providerSettings.model) : undefined
}

export function getActiveLLMSelection(store: StoreLike): ActiveLLMSelection | undefined {
  const settings = getNormalizedProviderSettings(store)
  const providerId = settings.activeProviders.llm
  const providerSettings = providerId ? settings.providerSettings[providerId] : undefined
  const model = providerSettings ? normalizeModel(providerSettings.model) : undefined

  if (!providerId || !model) {
    return undefined
  }

  return { providerId, model }
}

export async function resolveActiveASRProvider(deps: ASRProviderRuntimeDeps): Promise<ASRProvider> {
  return (await resolveActiveASRSelection(deps)).provider
}

export async function resolveActiveASRSelection(deps: ASRProviderRuntimeDeps): Promise<ActiveASRSelection> {
  const providerId = getActiveASRProviderId(deps.store)
  if (!providerId) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active ASR provider before processing a recording.'
    )
  }

  const providers = getProviderRecords(deps.store)
  const providerRecord = providers[providerId]
  if (!providerRecord?.enabled) {
    throw new ConfigurationError(providerId, 'Provider is not configured')
  }

  const settings = resolveValidatedASRProviderSettings(deps, providerId)
  const provider = deps.asrRegistry.resolve(providerId, providerRecord.config ?? {})

  // Local ASR providers must have an installed selected model before activation;
  // we never silently fall back to "first installed wins".
  if (deps.asrRegistry.isLocal(provider)) {
    const selectedModelId =
      typeof settings.selectedModelId === 'string' ? settings.selectedModelId.trim() : ''
    if (!selectedModelId) {
      throw new ConfigurationError(
        providerId,
        'Select a local ASR model before activating this provider.'
      )
    }
    // Throws ConfigurationError if the selected model is not installed in the
    // provider's configured modelDir.
    await provider.resolveModelRuntime(selectedModelId)
  }

  return { provider, settings }
}

function resolveValidatedASRProviderSettings(
  deps: ASRProviderRuntimeDeps,
  providerId: string
): Record<string, unknown> {
  const descriptor = deps.asrRegistry
    .listDescriptors()
    .find((entry): entry is ASRProviderDescriptor => entry.id === providerId)

  // If the provider doesn't define a settings schema, don't pass through persisted settings.
  const schema = descriptor?.settingsSchema
  if (!schema) {
    return {}
  }

  const normalized = getNormalizedProviderSettings(deps.store)
  const rawSettings = normalized.providerSettings[providerId] ?? {}

  try {
    const parsed = schema.parse(rawSettings)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfigurationError(providerId, `Provider settings are invalid: ${message}`)
  }
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

export async function resolveActiveLLMModel({ store }: { store: StoreLike }): Promise<string> {
  const selection = getActiveLLMSelection(store)
  if (!selection) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active LLM provider and model before requesting runtime access.'
    )
  }
  return selection.model
}

export async function resolveActiveLLMSelection(
  deps: LLMProviderRuntimeDeps
): Promise<{ provider: LLMProvider; model: string }> {
  const selection = getActiveLLMSelection(deps.store)
  if (!selection) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active LLM provider and model before requesting runtime access.'
    )
  }

  const provider = await resolveLLMProvider(selection.providerId, deps)
  return {
    provider,
    model: selection.model
  }
}

export async function selectFirstLLMModel(provider: LLMProvider): Promise<string> {
  const models = await provider.listModels()
  const modelId = models[0]?.id
  if (!modelId) {
    throw new ConfigurationError(provider.id, 'Provider did not return any models')
  }
  return modelId
}
