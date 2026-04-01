import type {
  ProviderSettings,
  ActiveProviders,
  ManualProviderConnectionRecord,
  ProviderConnectionRecord
} from '../../../shared/provider-auth'
import {
  clearActiveProviderSelections,
  defaultProviderSettings,
  normalizeProviderSettings
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
  const next = normalizeProviderSettings({
    providers: {
      ...current.providers,
      ...(partial.providers ?? {})
    },
    activeProviders: {
      ...current.activeProviders,
      ...(partial.activeProviders ?? {})
    }
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
  const { providers, activeProviders } = providerStore.getState().data
  const nextProviders = { ...providers }
  delete nextProviders[providerId]

  await providerStore.getState().replace({
    providers: nextProviders,
    activeProviders: clearActiveProviderSelections(activeProviders, providerId)
  })
}
