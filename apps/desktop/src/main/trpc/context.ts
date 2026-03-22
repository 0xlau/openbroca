import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { LLMProviderRegistry } from '@openbroca/core/llm'
import type { ASRProviderRegistry } from '@openbroca/core/asr'
import type { StoreSchema } from '../store'

export interface Context {
  window: BrowserWindow
  store: Store<StoreSchema>
  llmRegistry: LLMProviderRegistry
  asrRegistry: ASRProviderRegistry
}

export function createContext(
  window: BrowserWindow,
  store: Store<StoreSchema>,
  llmRegistry: LLMProviderRegistry,
  asrRegistry: ASRProviderRegistry
): Context {
  return { window, store, llmRegistry, asrRegistry }
}
