import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { appTrpcRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { registerTrpcIpcHandler } from './trpc/ipc-handler'
import { store } from './store'
import { llmRegistry, asrRegistry } from './providers'
import { windowManager } from './window-manager'
import { shortcutManager } from './shortcut-manager'
import { RtAudioCaptureSource } from '@openbroca/audio-capture'
import { ListeningSessionManager } from './listening-session'

const DEFAULT_ACCELERATOR = 'CommandOrControl+Space'

function getAccelerator(): string {
  const shortcuts = store.get('shortcuts') as { floatingWindowAccelerator?: string } | undefined
  return shortcuts?.floatingWindowAccelerator ?? DEFAULT_ACCELERATOR
}

const captureSource = new RtAudioCaptureSource()
const listeningSession = new ListeningSessionManager(captureSource)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerTrpcIpcHandler(appTrpcRouter, (window) =>
    createContext(window, store, llmRegistry, asrRegistry, captureSource)
  )

  ipcMain.handle('window:minimize', () => windowManager.getMain()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = windowManager.getMain()
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.handle('window:close', () => windowManager.getMain()?.close())
  ipcMain.handle('listening-session:get-state', () => listeningSession.getState())

  listeningSession.subscribe((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('listening-session:state-changed', state)
      }
    }
  })

  windowManager.setFloatingHiddenHandler(() => {
    listeningSession.stop()
  })

  windowManager.createMain()

  // Register global shortcut for floating window
  shortcutManager.start(
    getAccelerator(),
    () => {
      windowManager.showFloating()
      const mic = store.get('microphone') as { selectedDeviceId?: number | null } | undefined
      listeningSession.start({ deviceId: mic?.selectedDeviceId ?? undefined })
    },
    () => {
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
  listeningSession.stop()
  shortcutManager.stop()
  windowManager.destroyAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
