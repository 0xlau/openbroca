import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { AudioCaptureSource } from '@openbroca/audio-capture'
import type { ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProviderRegistry } from '@openbroca/providers/llm'
import type { OAuthService } from '../auth/oauth-service'
import type { HistoryRepository } from '../history-repository'
import type { AppIdentityService } from '../app-identity/service'
import type { AppUpdateService } from '../app-update-service'
import type { StoreSchema } from '../store'

export interface Context {
  window: BrowserWindow
  store: Store<StoreSchema>
  llmRegistry: LLMProviderRegistry
  asrRegistry: ASRProviderRegistry
  captureSource: AudioCaptureSource
  oauthService: OAuthService
  historyRepository: HistoryRepository
  appIdentityService: AppIdentityService
  updateService: AppUpdateService
}

export function createContext(
  window: BrowserWindow,
  store: Store<StoreSchema>,
  llmRegistry: LLMProviderRegistry,
  asrRegistry: ASRProviderRegistry,
  captureSource: AudioCaptureSource,
  oauthService: OAuthService,
  historyRepository: HistoryRepository,
  appIdentityService: AppIdentityService,
  updateService: AppUpdateService
): Context {
  return {
    window,
    store,
    llmRegistry,
    asrRegistry,
    captureSource,
    oauthService,
    historyRepository,
    appIdentityService,
    updateService
  }
}
