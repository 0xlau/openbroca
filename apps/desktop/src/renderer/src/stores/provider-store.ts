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
  const nextActiveModels = {
    ...current.activeModels,
    ...(partial.activeModels ?? {})
  }
  const hasLlmActiveProviderUpdate =
    partial.activeProviders !== undefined &&
    Object.prototype.hasOwnProperty.call(partial.activeProviders, 'llm')
  const hasLlmActiveModelUpdate =
    partial.activeModels !== undefined &&
    Object.prototype.hasOwnProperty.call(partial.activeModels, 'llm')

  if (
    hasLlmActiveProviderUpdate &&
    partial.activeProviders?.llm !== current.activeProviders.llm &&
    !hasLlmActiveModelUpdate
  ) {
    delete nextActiveModels.llm
  }

  const next = normalizeProviderSettings({
    ...current,
    ...partial,
    providers: {
      ...current.providers,
      ...(partial.providers ?? {})
    },
    providerModels: {
      ...current.providerModels,
      ...(partial.providerModels ?? {})
    },
    activeProviders: nextActiveProviders,
    activeModels: nextActiveModels
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
