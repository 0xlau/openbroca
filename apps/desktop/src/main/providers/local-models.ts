import { ConfigurationError, ProviderError } from '@openbroca/providers'
import type {
  ASRProviderRegistry,
  InstalledLocalModel,
  LocalCatalogModel,
  LocalModelInstallEvent
} from '@openbroca/providers/asr'
import { normalizeProviderSettings } from '../../shared/provider-auth'
import { getNormalizedProviderSettings, type StoreLike } from './runtime'

export interface MutableStoreLike extends StoreLike {
  set(key: string, value: unknown): void
}

export interface LocalModelStateView {
  providerId: string
  modelDir?: string
  selectedModelId?: string
  catalogModels: LocalCatalogModel[]
  installedModels: InstalledLocalModel[]
}

interface InFlightInstall {
  modelId: string
  controller: AbortController
}

/**
 * In-flight install handles, keyed by providerId. Module-scoped so that
 * `cancelLocalInstall` can find the current install regardless of which tRPC
 * caller started it (the connect dialog and settings panel may both observe
 * the same task).
 */
const inFlightInstalls = new Map<string, InFlightInstall>()

interface LocalServiceDeps {
  asrRegistry: ASRProviderRegistry
  store: MutableStoreLike
}

function requireLocalProvider(
  deps: LocalServiceDeps,
  providerId: string
): {
  provider: import('@openbroca/providers/asr').LocalASRProvider
  modelDir: string | undefined
} {
  const descriptor = deps.asrRegistry.listDescriptors().find((entry) => entry.id === providerId)
  if (!descriptor) {
    throw new ProviderError(providerId, `Provider "${providerId}" is not registered`)
  }
  if (descriptor.kind !== 'local') {
    throw new ProviderError(providerId, 'Provider is not a local ASR provider')
  }

  // Resolve with the persisted config when present, otherwise fall back to an
  // empty object — the descriptor's configSchema fills in the default modelDir.
  // This lets the connect dialog query state before a connection record exists.
  const settings = getNormalizedProviderSettings(deps.store)
  const record = settings.providers[providerId]
  const config =
    record?.connectionType === 'local' && record.config ? record.config : {}

  const provider = deps.asrRegistry.resolve(providerId, config)
  if (!deps.asrRegistry.isLocal(provider)) {
    throw new ProviderError(providerId, 'Provider is not local')
  }
  // Read modelDir from the resolved provider's config so callers see the
  // descriptor-applied default even when no record exists yet.
  const validatedConfig = descriptor.configSchema.parse(config) as { modelDir?: string }
  return { provider, modelDir: validatedConfig.modelDir }
}

export async function getLocalModelState(
  deps: LocalServiceDeps & { providerId: string }
): Promise<LocalModelStateView> {
  const settings = getNormalizedProviderSettings(deps.store)
  const { provider, modelDir } = requireLocalProvider(deps, deps.providerId)
  const [catalogModels, installedModels] = await Promise.all([
    provider.listCatalogModels(),
    provider.scanInstalledModels()
  ])
  return {
    providerId: deps.providerId,
    modelDir,
    selectedModelId: settings.providerSettings[deps.providerId]?.selectedModelId as string | undefined,
    catalogModels,
    installedModels
  }
}

export function selectLocalModel(
  deps: LocalServiceDeps & { providerId: string; modelId: string }
): void {
  const descriptor = deps.asrRegistry.listDescriptors().find((entry) => entry.id === deps.providerId)
  if (!descriptor || descriptor.kind !== 'local') {
    throw new ProviderError(deps.providerId, 'Provider is not a local ASR provider')
  }

  const current = getNormalizedProviderSettings(deps.store)
  const existingRecord = current.providers[deps.providerId]
  // If no record exists yet (first activation after a fresh install), create
  // one with the descriptor-default config so the user can pick an
  // already-installed model without first walking through Connect.
  const baseRecord =
    existingRecord?.connectionType === 'local'
      ? existingRecord
      : {
          enabled: false,
          connectionType: 'local' as const,
          config: descriptor.configSchema.parse({}) as Record<string, string>
        }

  deps.store.set('providers', normalizeProviderSettings({
    ...current,
    providers: {
      ...current.providers,
      [deps.providerId]: { ...baseRecord, enabled: true }
    },
    providerSettings: {
      ...current.providerSettings,
      [deps.providerId]: {
        ...(current.providerSettings[deps.providerId] ?? {}),
        selectedModelId: deps.modelId
      }
    }
  }))
}

export async function* installLocalModel(
  deps: LocalServiceDeps & { providerId: string; modelId: string }
): AsyncIterable<LocalModelInstallEvent> {
  const existing = inFlightInstalls.get(deps.providerId)
  if (existing) {
    if (existing.modelId !== deps.modelId) {
      throw new ProviderError(
        deps.providerId,
        `Another install (${existing.modelId}) is already in progress for this provider`
      )
    }
    // Same provider+modelId: a duplicate request. Reject rather than fan out;
    // the caller can re-fetch state to learn the install is already running.
    throw new ProviderError(
      deps.providerId,
      `Install for model ${deps.modelId} is already in progress`
    )
  }

  const { provider } = requireLocalProvider(deps, deps.providerId)
  const controller = new AbortController()
  inFlightInstalls.set(deps.providerId, { modelId: deps.modelId, controller })

  try {
    yield* provider.installModel(deps.modelId, controller.signal)
    selectLocalModel({ ...deps })
  } finally {
    inFlightInstalls.delete(deps.providerId)
  }
}

export function cancelLocalInstall(providerId: string): void {
  const handle = inFlightInstalls.get(providerId)
  if (handle) handle.controller.abort()
}

export async function removeLocalModel(
  deps: LocalServiceDeps & { providerId: string; modelId: string }
): Promise<void> {
  const settings = getNormalizedProviderSettings(deps.store)
  if (settings.providerSettings[deps.providerId]?.selectedModelId === deps.modelId) {
    throw new ConfigurationError(
      deps.providerId,
      'Cannot remove the active model — switch to another model first'
    )
  }

  const { provider } = requireLocalProvider(deps, deps.providerId)
  await provider.removeInstalledModel(deps.modelId)
}

export function changeLocalModelDirectory(
  deps: LocalServiceDeps & { providerId: string; modelDir: string }
): void {
  const current = getNormalizedProviderSettings(deps.store)
  const existing = current.providers[deps.providerId]
  if (existing && existing.connectionType !== 'local') {
    throw new ProviderError(deps.providerId, 'Provider is not a local ASR provider')
  }
  deps.store.set('providers', normalizeProviderSettings({
    ...current,
    providers: {
      ...current.providers,
      [deps.providerId]: {
        enabled: existing?.enabled ?? false,
        connectionType: 'local',
        config: { modelDir: deps.modelDir }
      }
    },
    // The previously selected model may not exist under the new directory;
    // clear the selection so setup-status drops out of `ready` until the user
    // picks again.
    providerSettings: {
      ...current.providerSettings,
      [deps.providerId]: {}
    }
  }))
  // The registry's stableCacheKey-based eviction will see the changed
  // config on the next resolve() and rebuild the provider with the new
  // modelDir automatically.
}
