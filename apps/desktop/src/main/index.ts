import { app, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { appTrpcRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { registerTrpcIpcHandler } from './trpc/ipc-handler'
import { store } from './store'
import { llmRegistry, asrRegistry } from './providers'
import { windowManager } from './window-manager'
import { shortcutManager } from './shortcut-manager'

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space'

function getAccelerator(): string {
  const shortcuts = store.get('shortcuts') as { floatingWindowAccelerator?: string } | undefined
  return shortcuts?.floatingWindowAccelerator ?? DEFAULT_ACCELERATOR
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerTrpcIpcHandler(appTrpcRouter, (window) =>
    createContext(window, store, llmRegistry, asrRegistry)
  )

  ipcMain.handle('window:minimize', () => windowManager.getMain()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = windowManager.getMain()
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.handle('window:close', () => windowManager.getMain()?.close())

  windowManager.createMain()

  // Register global shortcut for floating window
  shortcutManager.start(
    getAccelerator(),
    () => windowManager.showFloating(),
    () => windowManager.hideFloating()
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
  shortcutManager.stop()
  windowManager.destroyAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
