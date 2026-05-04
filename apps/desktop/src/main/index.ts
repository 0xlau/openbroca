import { app, BrowserWindow, clipboard, ipcMain, protocol } from 'electron'
import { execFile as nodeExecFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createDiscoveryClient } from '@openbroca/app-identity/discovery'
import { getMacFrontmostApp, listMacApps } from '@openbroca/app-identity/platform/macos'
import { getWindowsFrontmostApp, listWindowsApps } from '@openbroca/app-identity/platform/windows'
import { appTrpcRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { registerTrpcIpcHandler } from './trpc/ipc-handler'
import { store } from './store'
import { llmRegistry, asrRegistry, registerLocalASRProviders } from './providers'
import { getProviderHost } from './provider-host/host'
import { windowManager } from './window-manager'
import { shortcutManager } from './shortcut-manager'
import { TrayManager } from './tray-manager'
import {
  requestDesktopControlPermission,
  requestMicrophonePermission,
  resolveOnboardingGateSnapshot
} from './onboarding-gate/service'
import { OnboardingWatcher } from './onboarding-gate/watcher'
import type { OnboardingGateSnapshot } from './onboarding-gate/types'
import { normalizeOnboardingState } from '../shared/onboarding'
import {
  bindFloatingSessionController,
  type FloatingSessionController
} from './floating-session-controller'
import { RtAudioCaptureSource } from '@openbroca/audio-capture'
import { ListeningSessionManager } from './listening-session'
import { HistoryRepository } from './history-repository'
import { createInstructionMatcher } from './instructions/matcher'
import { RecordingStorage } from './recording-storage'
import {
  createNormalizedCleanupPromptContextGetters,
  PostRecordingPipeline
} from './post-recording-pipeline'
import { createHistoryAudioProtocolHandler, HISTORY_AUDIO_PROTOCOL } from './history-audio-protocol'
import { resolveActiveASRSelection, resolveActiveLLMSelection } from './providers/runtime'
import { createFinalTextDeliveryService } from './final-text-delivery/service'
import { createMacPasteText } from './final-text-delivery/platform/macos'
import { createWindowsPasteText } from './final-text-delivery/platform/windows'
import { createAutoEnterService } from './send-key/auto-enter'
import { AppIdentityService } from './app-identity/service'
import { FocusedInputAppService } from './focused-input/service'
import { resolveWindowsFocusedInputApp } from './focused-input/platform/windows'
import { OAuthService } from './auth/oauth-service'
import { secureStorage } from './auth/secure-storage'
import { normalizeInstructionsSettings } from '../shared/instructions'
import type { ListeningSessionBridgeState } from '../shared/listening-session-state'
import { normalizeShortcutSettings } from '../shared/shortcuts'
import { createNotifyWindows } from './notify-windows'

const macBundleIconCache = new Map<string, Promise<string | undefined>>()
let floatingSessionController: FloatingSessionController | null = null
let trayManager: TrayManager | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: HISTORY_AUDIO_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true
    }
  }
])

function deriveMacBundlePath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined
  }

  if (filePath.endsWith('.app')) {
    return filePath
  }

  const markerIndex = filePath.indexOf('.app/')
  if (markerIndex >= 0) {
    return filePath.slice(0, markerIndex + 4)
  }

  return undefined
}

async function readMacBundleIconFileName(bundlePath: string): Promise<string | undefined> {
  const infoPlistPath = join(bundlePath, 'Contents', 'Info.plist')

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      nodeExecFile(
        '/usr/libexec/PlistBuddy',
        ['-c', 'Print :CFBundleIconFile', infoPlistPath],
        (error, rawStdout) => {
          if (error) {
            reject(error)
            return
          }
          resolve((rawStdout ?? '').trim())
        }
      )
    })

    return stdout || undefined
  } catch {
    return undefined
  }
}

async function resolveMacBundleIconDataUrl(filePath?: string): Promise<string | undefined> {
  const bundlePath = deriveMacBundlePath(filePath)
  if (!bundlePath) {
    return undefined
  }

  const cached = macBundleIconCache.get(bundlePath)
  if (cached) {
    return cached
  }

  const pending = (async () => {
    const iconFileName = await readMacBundleIconFileName(bundlePath)
    if (!iconFileName) {
      return undefined
    }

    const iconPath = join(
      bundlePath,
      'Contents',
      'Resources',
      iconFileName.endsWith('.icns') ? iconFileName : `${iconFileName}.icns`
    )

    try {
      await access(iconPath)
    } catch {
      return undefined
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'openbroca-app-icon-'))
    const outputPath = join(tempDir, 'icon.png')

    try {
      await new Promise<void>((resolve, reject) => {
        nodeExecFile(
          '/usr/bin/sips',
          ['-s', 'format', 'png', iconPath, '--out', outputPath],
          (error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          }
        )
      })

      const png = await readFile(outputPath)
      return `data:image/png;base64,${png.toString('base64')}`
    } catch {
      return undefined
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })()

  macBundleIconCache.set(bundlePath, pending)
  return pending
}

const captureSource = new RtAudioCaptureSource()
const oauthService = new OAuthService({
  store,
  secureStorage,
  providers: {}
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
    : process.platform === 'win32'
      ? createDiscoveryClient({
          platform: 'windows',
          listDetectedApps: listWindowsApps,
          getDetectedFrontmostApp: getWindowsFrontmostApp
        })
      : {
          listApps: async () => [],
          getFrontmostApp: async () => null
        }
const appIdentityService = new AppIdentityService({
  listApps: () => discoveryClient.listApps(),
  getFrontmostApp: () => discoveryClient.getFrontmostApp(),
  resolveBundleIconDataUrl:
    process.platform === 'darwin' ? (filePath) => resolveMacBundleIconDataUrl(filePath) : undefined,
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
const cleanupPromptContextGetters = createNormalizedCleanupPromptContextGetters({
  getDictionaryRaw: () => store.get('dictionary'),
  getAboutMeRaw: () => store.get('aboutMe'),
  getPromptsRaw: () => store.get('prompts')
})
const focusedInputAppService = new FocusedInputAppService({
  resolveFocusedInputApp:
    process.platform === 'win32' ? () => resolveWindowsFocusedInputApp() : undefined,
  hydrateApp:
    process.platform === 'win32' ? (app) => appIdentityService.hydrateApp(app) : undefined,
  getFrontmostApp: () => appIdentityService.getFrontmostApp()
})
const autoEnterService = createAutoEnterService()
const notifyWindows = createNotifyWindows()
const pasteText =
  process.platform === 'darwin'
    ? createMacPasteText()
    : process.platform === 'win32'
      ? createWindowsPasteText()
      : async () => ({
          ok: false as const,
          reason: 'not-available' as const
        })
const finalTextDeliveryService = createFinalTextDeliveryService({
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(text),
    availableFormats: () => clipboard.availableFormats(),
    readBuffer: (format) => clipboard.readBuffer(format),
    writeBuffer: (format, data) => clipboard.writeBuffer(format, data),
    clear: () => clipboard.clear()
  },
  getTargetApp: () => focusedInputAppService.getStrictFocusedInputApp(),
  pasteText,
  triggerAutoEnter: (mode) => autoEnterService.triggerAutoEnter(mode),
  notifyClipboardFallback: async (result) => {
    await notifyWindows.show({
      title: 'Copied to clipboard',
      body: result.failureMessage ?? 'Paste it into the target app'
    })
  }
})
const postRecordingPipeline = new PostRecordingPipeline({
  historyRepository,
  recordingStorage,
  resolveActiveASRSelection: () =>
    resolveActiveASRSelection({
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
  getTargetAppForPrompt: () => appIdentityService.getFrontmostApp(),
  getDictionarySettings: cleanupPromptContextGetters.getDictionarySettings,
  getAboutMeSettings: cleanupPromptContextGetters.getAboutMeSettings,
  getPromptTemplateSettings: cleanupPromptContextGetters.getPromptTemplateSettings,
  finalTextDeliveryService
})
const listeningSession = new ListeningSessionManager(captureSource, {
  getFrontmostAppSnapshot: () => appIdentityService.getFrontmostApp(),
  getTargetApp: () => focusedInputAppService.getFocusedInputApp(),
  onRecordingComplete: (recording, signal) => postRecordingPipeline.process(recording, { signal })
})

function getListeningSessionBridgeState(): ListeningSessionBridgeState {
  return {
    ...listeningSession.getState(),
    captureMode: floatingSessionController?.getCaptureMode() ?? null
  }
}

function broadcastListeningSessionState(): void {
  const bridgeState = getListeningSessionBridgeState()
  console.debug('[voice-debug] broadcasting listening state', bridgeState)

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('listening-session:state-changed', bridgeState)
    }
  }
}

function ensureOnboardingWindow(snapshot: OnboardingGateSnapshot): void {
  if (snapshot.mode === 'none') return

  const existing = windowManager.getOnboarding()
  if (existing && !existing.isDestroyed()) {
    return
  }

  const onboardingWindow = windowManager.createOnboarding(snapshot.mode)

  const watcher = new OnboardingWatcher({
    resolve: () =>
      resolveOnboardingGateSnapshot(() => normalizeOnboardingState(store.get('onboarding'))),
    pushSnapshot: (next) => {
      if (!onboardingWindow.isDestroyed()) {
        onboardingWindow.webContents.send('onboarding:state-changed', next)
      }
    },
    onMaybeAdvance: refreshOnboardingGateAndMaybeAdvance
  })
  watcher.start(onboardingWindow)

  onboardingWindow.on('closed', () => {
    watcher.stop()
    if (!windowManager.getMain()) {
      app.quit()
    }
  })
}

function ensureCaptureEntryPointsReady(): void {
  if (floatingSessionController) {
    return
  }

  floatingSessionController = bindFloatingSessionController({
    shortcutSettings: normalizeShortcutSettings(store.get('shortcuts'), process.platform),
    getSelectedDeviceId: () => {
      const mic = store.get('microphone') as { selectedDeviceId?: number | null } | undefined
      return mic?.selectedDeviceId
    },
    onCaptureModeChange: () => {
      broadcastListeningSessionState()
    },
    listeningSession,
    shortcutManager,
    windowManager
  })
}

async function refreshOnboardingGateAndMaybeAdvance(): Promise<OnboardingGateSnapshot> {
  const snapshot = await resolveOnboardingGateSnapshot(() =>
    normalizeOnboardingState(store.get('onboarding'))
  )
  if (snapshot.canEnterMainWindow) {
    ensureCaptureEntryPointsReady()
    if (!windowManager.getMain()) {
      windowManager.createMain()
      trayManager?.notifyMainWindowChanged()
    }
    windowManager.closeOnboarding()
    return snapshot
  }

  ensureOnboardingWindow(snapshot)
  return snapshot
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('me.timlau.openbroca')

  const defaultModelDir = join(app.getPath('userData'), 'asr-models', 'sherpa-onnx')
  registerLocalASRProviders({ defaultModelDir })

  // Spawn the provider host utility process. All ASR/LLM execution lives in
  // this child so heavy CPU work (sherpa-onnx native inference) and network
  // I/O cannot block the main process event loop. We await readiness here so
  // any subsequent code that resolves a provider sees a live host.
  await getProviderHost().start({ defaultModelDir })

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
  protocol.handle(HISTORY_AUDIO_PROTOCOL, createHistoryAudioProtocolHandler(historyRepository))

  ipcMain.handle('window:minimize', () => windowManager.getMain()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = windowManager.getMain()
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.handle('window:close', () => windowManager.getMain()?.close())
  ipcMain.handle('permissions:get-snapshot', () =>
    resolveOnboardingGateSnapshot(() => normalizeOnboardingState(store.get('onboarding')))
  )
  ipcMain.handle('permissions:request-microphone', async () => {
    await requestMicrophonePermission()
    return refreshOnboardingGateAndMaybeAdvance()
  })
  ipcMain.handle('permissions:open-desktop-control-settings', async () => {
    requestDesktopControlPermission()
    return refreshOnboardingGateAndMaybeAdvance()
  })
  ipcMain.handle('permissions:refresh', () => refreshOnboardingGateAndMaybeAdvance())
  ipcMain.handle('permissions:quit-app', () => app.quit())
  ipcMain.handle('listening-session:get-state', () => getListeningSessionBridgeState())
  ipcMain.handle('listening-session:cancel-capture', () => listeningSession.cancelCapture())
  ipcMain.handle('listening-session:cancel-processing', () => listeningSession.cancelProcessing())
  ipcMain.handle('listening-session:finish-capture', () =>
    floatingSessionController?.finishCapture()
  )
  ipcMain.handle('notify-window:get-state', () => notifyWindows.getState())
  ipcMain.handle('provider-auth:connect', (_event, providerId: string) =>
    oauthService.start(providerId)
  )
  ipcMain.handle('provider-auth:disconnect', (_event, providerId: string) =>
    oauthService.disconnect(providerId)
  )

  listeningSession.subscribe(() => {
    broadcastListeningSessionState()
  })

  trayManager = new TrayManager({
    windowManager,
    captureSource,
    store,
    onShowMainRequested: async () => {
      await refreshOnboardingGateAndMaybeAdvance()
    }
  })
  trayManager.start()

  await refreshOnboardingGateAndMaybeAdvance()

  store.onDidChange('shortcuts', (rawValue) => {
    const nextSettings = normalizeShortcutSettings(rawValue, process.platform)
    floatingSessionController?.updateShortcuts(nextSettings)
  })

  store.onDidChange('onboarding', () => {
    void refreshOnboardingGateAndMaybeAdvance()
  })

  app.on('activate', async () => {
    const mainWindow = windowManager.getMain()
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
      return
    }
    if (!windowManager.getOnboarding()) {
      await refreshOnboardingGateAndMaybeAdvance()
    }
  })
})

app.on('will-quit', () => {
  floatingSessionController?.dispose()
  floatingSessionController = null
  trayManager?.dispose()
  trayManager = null
  void oauthService.dispose()
  listeningSession.stop()
  shortcutManager.stop()
  windowManager.destroyAll()
  void getProviderHost().dispose()
})

// Keep the app running in the tray when all windows close — Quit menu item is the only exit.
app.on('window-all-closed', () => {})
