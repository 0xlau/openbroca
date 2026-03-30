import { createPersistedStore } from './create-persisted-store'

export interface DictionaryEntry {
  id: string
  term: string
  type?: 'hotword' | 'replacement'
  replacement?: string
  note?: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface DictionarySettings {
  entries: DictionaryEntry[]
}

export const dictionaryStore = createPersistedStore<DictionarySettings>({
  key: 'dictionary',
  defaults: {
    entries: []
  }
})
