import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import {
  createDiscoveryClient,
  getMacFrontmostApp,
  getWindowsFrontmostApp,
  listMacApps,
  listWindowsApps
} from '@openbroca/app-identity'
import { appTrpcRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { registerTrpcIpcHandler } from './trpc/ipc-handler'
import { store } from './store'
import { llmRegistry, asrRegistry } from './providers'
import { windowManager } from './window-manager'
import { shortcutManager } from './shortcut-manager'
import { RtAudioCaptureSource } from '@openbroca/audio-capture'
import { ListeningSessionManager } from './listening-session'
import { HistoryRepository } from './history-repository'
import { createInstructionMatcher } from './instructions/matcher'
import { RecordingStorage } from './recording-storage'
import { PostRecordingPipeline } from './post-recording-pipeline'
import {
  resolveActiveASRProvider,
  resolveActiveLLMSelection
} from './providers/runtime'
import { createAutoEnterService } from './send-key/auto-enter'
import { AppIdentityService } from './app-identity/service'
import { OAuthService } from './auth/oauth-service'
import { openaiCodexOAuth } from './auth/openai-codex-oauth'
import { secureStorage } from './auth/secure-storage'
import { normalizeInstructionsSettings } from '../shared/instructions'

const DEFAULT_ACCELERATOR = 'CommandOrControl+Space'

function getAccelerator(): string {
  const shortcuts = store.get('shortcuts') as { floatingWindowAccelerator?: string } | undefined
  return shortcuts?.floatingWindowAccelerator ?? DEFAULT_ACCELERATOR
}

const captureSource = new RtAudioCaptureSource()
const oauthService = new OAuthService({
  store,
  secureStorage,
  providers: {
    'openai-codex': openaiCodexOAuth
  }
})
const historyRepository = new HistoryRepository(store)
const recordingStorage = new RecordingStorage()
const discoveryClient =
  process.platform === 'darwin'
    ? createDiscoveryClient({
        platform: 'macos',
        listDetectedApps: listMacApps,
        getDetectedFrontmostApp: getMacFrontmostApp
      })
    : createDiscoveryClient({
        platform: 'windows',
        listDetectedApps: listWindowsApps,
        getDetectedFrontmostApp: getWindowsFrontmostApp
      })
const appIdentityService = new AppIdentityService({
  listApps: () => discoveryClient.listApps(),
  getFrontmostApp: () => discoveryClient.getFrontmostApp(),
  resolveIconDataUrl: async (filePath) => {
    if (!filePath) return undefined
    const icon = await app.getFileIcon(filePath)
    return icon.isEmpty() ? undefined : icon.toDataURL()
  }
})
const resolveMatchedInstruction = createInstructionMatcher({
  getInstructions: () => normalizeInstructionsSettings(store.get('instructions')),
  getFrontmostApp: () => appIdentityService.getFrontmostApp()
})
const autoEnterService = createAutoEnterService()
const postRecordingPipeline = new PostRecordingPipeline({
  historyRepository,
  recordingStorage,
  resolveActiveASRProvider: () =>
    resolveActiveASRProvider({
      asrRegistry,
      store
    }),
  resolveActiveLLMSelection: () =>
    resolveActiveLLMSelection({
      llmRegistry,
      oauthService,
      store
    }),
  resolveMatchedInstruction,
  autoEnterService
})
const listeningSession = new ListeningSessionManager(captureSource, {
  onRecordingComplete: (recording) => void postRecordingPipeline.process(recording)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerTrpcIpcHandler(appTrpcRouter, (window) =>
    createContext(
      window,
      store,
      llmRegistry,
      asrRegistry,
      captureSource,
      oauthService,
      historyRepository,
      appIdentityService
    )
  )

  ipcMain.handle('window:minimize', () => windowManager.getMain()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = windowManager.getMain()
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.handle('window:close', () => windowManager.getMain()?.close())
  ipcMain.handle('listening-session:get-state', () => listeningSession.getState())
  ipcMain.handle('provider-auth:connect', (_event, providerId: string) => oauthService.start(providerId))
  ipcMain.handle('provider-auth:disconnect', (_event, providerId: string) =>
    oauthService.disconnect(providerId)
  )

  listeningSession.subscribe((state) => {
    console.debug('[voice-debug] broadcasting listening state', state)
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('listening-session:state-changed', state)
      }
    }
  })

  windowManager.setFloatingHiddenHandler(() => {
    console.debug('[voice-debug] floating window hidden, stopping listening session')
    listeningSession.stop()
  })

  windowManager.createMain()

  // Register global shortcut for floating window
  shortcutManager.start(
    getAccelerator(),
    () => {
      const mic = store.get('microphone') as { selectedDeviceId?: number | null } | undefined
      console.debug('[voice-debug] shortcut key down', {
        accelerator: getAccelerator(),
        selectedDeviceId: mic?.selectedDeviceId ?? null
      })
      windowManager.showFloating()
      listeningSession.start({ deviceId: mic?.selectedDeviceId ?? undefined })
    },
    () => {
      console.debug('[voice-debug] shortcut key up, hiding floating window')
      windowManager.hideFloating()
    }
  )

  // Re-register when accelerator config changes
  store.onDidChange('shortcuts', () => {
    shortcutManager.updateAccelerator(getAccelerator())
  })

  app.on('activate', () => {
    if (!windowManager.getMain()) {
      windowManager.createMain()
    }
  })
})

app.on('will-quit', () => {
  void oauthService.dispose()
  listeningSession.stop()
  shortcutManager.stop()
  windowManager.destroyAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
