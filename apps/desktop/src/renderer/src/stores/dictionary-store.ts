import { createPersistedStore } from './create-persisted-store'
import {
  defaultDictionarySettings,
  normalizeDictionarySettings,
  type DictionaryEntry,
  type DictionarySettings
} from '../../../shared/dictionary'

export type { DictionaryEntry, DictionarySettings }

export const dictionaryStore = createPersistedStore<DictionarySettings>({
  key: 'dictionary',
  defaults: defaultDictionarySettings,
  normalize: normalizeDictionarySettings
})
