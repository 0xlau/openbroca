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

  const next = normalizeProviderSettings({
    ...current,
    ...partial,
    providers: {
      ...current.providers,
      ...(partial.providers ?? {})
    },
    providerSettings: {
      ...current.providerSettings,
      ...(partial.providerSettings ?? {})
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
