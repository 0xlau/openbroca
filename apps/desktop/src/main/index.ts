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
import { llmRegistry, asrRegistry } from './providers'
import { windowManager } from './window-manager'
import { shortcutManager } from './shortcut-manager'
import { bindFloatingSessionController } from './floating-session-controller'
import { RtAudioCaptureSource } from '@openbroca/audio-capture'
import { ListeningSessionManager } from './listening-session'
import { HistoryRepository } from './history-repository'
import { createInstructionMatcher } from './instructions/matcher'
import { RecordingStorage } from './recording-storage'
import {
  createNormalizedCleanupPromptContextGetters,
  PostRecordingPipeline
} from './post-recording-pipeline'
import {
  createHistoryAudioProtocolHandler,
  HISTORY_AUDIO_PROTOCOL
} from './history-audio-protocol'
import {
  resolveActiveASRSelection,
  resolveActiveLLMSelection
} from './providers/runtime'
import { createFinalTextDeliveryService } from './final-text-delivery/service'
import { createMacPasteText } from './final-text-delivery/platform/macos'
import { createWindowsPasteText } from './final-text-delivery/platform/windows'
import { createAutoEnterService } from './send-key/auto-enter'
import { AppIdentityService } from './app-identity/service'
import { FocusedInputAppService } from './focused-input/service'
import { resolveWindowsFocusedInputApp } from './focused-input/platform/windows'
import { OAuthService } from './auth/oauth-service'
import { openaiCodexOAuth } from './auth/openai-codex-oauth'
import { secureStorage } from './auth/secure-storage'
import { normalizeInstructionsSettings } from '../shared/instructions'
import { createNotifyWindows } from './notify-windows'

const DEFAULT_ACCELERATOR = 'CommandOrControl+Space'
const macBundleIconCache = new Map<string, Promise<string | undefined>>()
let unbindFloatingSessionController: (() => void) | null = null

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

function getAccelerator(): string {
  const shortcuts = store.get('shortcuts') as { floatingWindowAccelerator?: string } | undefined
  return shortcuts?.floatingWindowAccelerator ?? DEFAULT_ACCELERATOR
}

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
        nodeExecFile('/usr/bin/sips', ['-s', 'format', 'png', iconPath, '--out', outputPath], (error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
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
  hydrateApp: process.platform === 'win32' ? (app) => appIdentityService.hydrateApp(app) : undefined,
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
  protocol.handle(HISTORY_AUDIO_PROTOCOL, createHistoryAudioProtocolHandler(historyRepository))

  ipcMain.handle('window:minimize', () => windowManager.getMain()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = windowManager.getMain()
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.handle('window:close', () => windowManager.getMain()?.close())
  ipcMain.handle('listening-session:get-state', () => listeningSession.getState())
  ipcMain.handle('listening-session:cancel-processing', () => listeningSession.cancelProcessing())
  ipcMain.handle('notify-window:get-state', () => notifyWindows.getState())
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

  windowManager.createMain()

  unbindFloatingSessionController = bindFloatingSessionController({
    accelerator: getAccelerator(),
    getSelectedDeviceId: () => {
      const mic = store.get('microphone') as { selectedDeviceId?: number | null } | undefined
      return mic?.selectedDeviceId
    },
    listeningSession,
    shortcutManager,
    windowManager
  })

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
  unbindFloatingSessionController?.()
  unbindFloatingSessionController = null
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
