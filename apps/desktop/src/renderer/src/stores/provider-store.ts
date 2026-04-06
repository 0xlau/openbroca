import type {
  ProviderSettings,
  ActiveProviders,
  ManualProviderConnectionRecord,
  ProviderConnectionRecord
} from '../../../shared/provider-auth'
import {
  defaultProviderSettings,
  normalizeProviderSettings,
  removeProviderState
} from '../../../shared/provider-auth'
import { createPersistedStore } from './create-persisted-store'

export type {
  ActiveProviders,
  ManualProviderConnectionRecord,
  ProviderConnectionRecord,
  ProviderSettings
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeProviderSettings(
  current: ProviderSettings['providerSettings'],
  partial: ProviderSettings['providerSettings'] | undefined
): ProviderSettings['providerSettings'] {
  if (!partial) {
    return current
  }

  let next: ProviderSettings['providerSettings'] | null = null
  for (const [providerId, partialSettings] of Object.entries(partial)) {
    if (!next) {
      next = { ...current }
    }

    const existing = current[providerId]
    if (isRecord(existing) && isRecord(partialSettings)) {
      next[providerId] = { ...existing, ...partialSettings }
    } else {
      next[providerId] = partialSettings
    }
  }

  return next ?? current
}

const providerStoreBase = createPersistedStore<ProviderSettings>({
  key: 'providers',
  defaults: defaultProviderSettings,
  normalize: normalizeProviderSettings
})

async function updateProviderSettingsSafely(partial: Partial<ProviderSettings>): Promise<void> {
  const current = providerStoreBase.getState().data
  const nextActiveProviders: ActiveProviders = {
    ...current.activeProviders,
    ...(partial.activeProviders ?? {})
  }
  const nextProviderSettings = mergeProviderSettings(current.providerSettings, partial.providerSettings)

  const next = normalizeProviderSettings({
    ...current,
    ...partial,
    providers: {
      ...current.providers,
      ...(partial.providers ?? {})
    },
    providerSettings: {
      ...nextProviderSettings
    },
    activeProviders: nextActiveProviders
  })

  await providerStoreBase.getState().replace(next)
}

providerStoreBase.setState({
  update: updateProviderSettingsSafely
})

export const providerStore = providerStoreBase

export async function upsertProviderConnection(
  providerId: string,
  connection: ProviderConnectionRecord
): Promise<void> {
  await providerStore.getState().update({
    providers: {
      [providerId]: connection
    }
  })
}

export async function removeProviderConnection(providerId: string): Promise<void> {
  const current = providerStore.getState().data
  await providerStore.getState().replace(removeProviderState(current, providerId))
}
