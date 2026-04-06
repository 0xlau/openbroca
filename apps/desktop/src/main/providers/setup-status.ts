import type { ProviderSetupStatus } from '@openbroca/providers'
import type { ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProviderRegistry } from '@openbroca/providers/llm'
import { getNormalizedProviderSettings, type StoreLike } from './runtime'

interface LLMSetupStatusDeps {
  llmRegistry: LLMProviderRegistry
  store: StoreLike
}

interface ASRSetupStatusDeps {
  asrRegistry: ASRProviderRegistry
  store: StoreLike
}

export async function resolveLLMSetupStatus(
  providerId: string,
  deps: LLMSetupStatusDeps
): Promise<ProviderSetupStatus> {
  const normalized = getNormalizedProviderSettings(deps.store)
  const descriptor = deps.llmRegistry.listDescriptors().find((entry) => entry.id === providerId)
  if (!descriptor) {
    return {
      status: 'invalid',
      canActivate: false,
      blockingReasons: ['Provider is not available']
    }
  }

  const connection = normalized.providers[providerId]
  const settings = normalized.providerSettings[providerId] ?? {}

  if (!connection?.enabled) {
    return {
      status: 'not-connected',
      canActivate: false,
      blockingReasons: ['Connect the provider first']
    }
  }

  if (!descriptor?.getSetupStatus) {
    return {
      status: 'ready',
      canActivate: true,
      blockingReasons: []
    }
  }

  return await descriptor.getSetupStatus({ connection, settings })
}

export async function resolveASRSetupStatus(
  providerId: string,
  deps: ASRSetupStatusDeps
): Promise<ProviderSetupStatus> {
  const normalized = getNormalizedProviderSettings(deps.store)
  const descriptor = deps.asrRegistry.listDescriptors().find((entry) => entry.id === providerId)
  if (!descriptor) {
    return {
      status: 'invalid',
      canActivate: false,
      blockingReasons: ['Provider is not available']
    }
  }

  const connection = normalized.providers[providerId]
  const settings = normalized.providerSettings[providerId] ?? {}

  if (!connection?.enabled) {
    return {
      status: 'not-connected',
      canActivate: false,
      blockingReasons: ['Connect the provider first']
    }
  }

  if (!descriptor?.getSetupStatus) {
    return {
      status: 'ready',
      canActivate: true,
      blockingReasons: []
    }
  }

  return await descriptor.getSetupStatus({ connection, settings })
}
