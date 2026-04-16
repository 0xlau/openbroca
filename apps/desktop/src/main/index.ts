import { app, BrowserWindow, ipcMain, protocol } from 'electron'
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
import { RtAudioCaptureSource } from '@openbroca/audio-capture'
import { ListeningSessionManager } from './listening-session'
import { HistoryRepository } from './history-repository'
import { createInstructionMatcher } from './instructions/matcher'
import { RecordingStorage } from './recording-storage'
import { PostRecordingPipeline } from './post-recording-pipeline'
import {
  createHistoryAudioProtocolHandler,
  HISTORY_AUDIO_PROTOCOL
} from './history-audio-protocol'
import {
  resolveActiveASRSelection,
  resolveActiveLLMSelection
} from './providers/runtime'
import { createAutoEnterService } from './send-key/auto-enter'
import { AppIdentityService } from './app-identity/service'
import { OAuthService } from './auth/oauth-service'
import { openaiCodexOAuth } from './auth/openai-codex-oauth'
import { secureStorage } from './auth/secure-storage'
import { normalizeInstructionsSettings } from '../shared/instructions'

const DEFAULT_ACCELERATOR = 'CommandOrControl+Space'
const macBundleIconCache = new Map<string, Promise<string | undefined>>()

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
const autoEnterService = createAutoEnterService()
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
  autoEnterService
})
const listeningSession = new ListeningSessionManager(captureSource, {
  getFrontmostAppSnapshot: () => appIdentityService.getFrontmostApp(),
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
  protocol.handle(HISTORY_AUDIO_PROTOCOL, createHistoryAudioProtocolHandler(historyRepository))

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
