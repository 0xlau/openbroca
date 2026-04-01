import { createStore, type StoreApi } from 'zustand'
import { trpcClient } from '../trpc/client'

interface PersistedStoreConfig<T> {
  key: string
  defaults: T
  normalize?: (raw: unknown) => T
}

export interface PersistedStoreState<T> {
  data: T
  isHydrated: boolean
  update: (partial: Partial<T>) => Promise<void>
  replace: (data: T) => Promise<void>
  hydrate: () => Promise<void>
}

export function createPersistedStore<T extends object>(
  config: PersistedStoreConfig<T>
): StoreApi<PersistedStoreState<T>> {
  const normalize = (raw: unknown): T =>
    config.normalize ? config.normalize(raw) : { ...config.defaults, ...(raw as T) }

  const zustandStore = createStore<PersistedStoreState<T>>((set, get) => ({
    data: config.defaults,
    isHydrated: false,

    update: async (partial) => {
      const merged = { ...get().data, ...partial }
      set({ data: merged })
      await trpcClient.store.set.mutate({ key: config.key, value: merged })
    },

    replace: async (data) => {
      set({ data })
      await trpcClient.store.set.mutate({ key: config.key, value: data })
    },

    hydrate: async () => {
      const raw = await trpcClient.store.get.query({ key: config.key })
      if (raw != null) {
        set({ data: normalize(raw), isHydrated: true })
      } else {
        set({ isHydrated: true })
      }
    }
  }))

  // Auto-hydrate on creation
  zustandStore.getState().hydrate()

  // Watch for external changes and keep store in sync
  trpcClient.store.watch.subscribe(
    { key: config.key },
    {
      onData: (newValue) => {
        if (newValue != null) {
          zustandStore.setState({ data: normalize(newValue) })
        }
      }
    }
  )

  return zustandStore
}
