import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { readFileSync } from 'node:fs'
import type ElectronStore from 'electron-store'
import type { AudioCaptureSource } from '@openbroca/audio-capture'
import type { StoreSchema } from './store/schema'
import type { WindowManager } from './window-manager'
import type { AppUpdateService } from './app-update-service'
import {
  AUDIO_DEVICES_SNAPSHOT_KEY,
  type AudioDeviceSnapshotEntry,
  type AudioDevicesSnapshot
} from '../shared/audio-devices'
import trayIcon1xPath from '../../resources/tray-Template.png?asset'
import trayIcon2xPath from '../../resources/tray-Template@2x.png?asset'

interface PersistedMicrophoneSettings {
  selectedDeviceId: number | null
  selectedBrowserDeviceId: string | null
}

interface TrayManagerOptions {
  windowManager: WindowManager
  captureSource: AudioCaptureSource
  store: ElectronStore<StoreSchema>
  updateService: AppUpdateService
  /** Called when the user picks Show but the main window isn't created yet. */
  onShowMainRequested: () => void | Promise<void>
}

const MICROPHONE_STORE_KEY = 'microphone' as keyof StoreSchema
const SNAPSHOT_STORE_KEY = AUDIO_DEVICES_SNAPSHOT_KEY as keyof StoreSchema

class TrayManager {
  private tray: Tray | null = null
  private unsubscribeMicChange: (() => void) | null = null
  private unsubscribeSnapshotChange: (() => void) | null = null
  private unsubscribeUpdateChange: (() => void) | null = null
  private currentMainWindow: ReturnType<WindowManager['getMain']> = null

  constructor(private readonly options: TrayManagerOptions) {}

  start(): void {
    if (this.tray) return

    const image = this.createTrayImage()
    this.tray = new Tray(image)
    this.tray.setToolTip('OpenBroca')
    this.tray.on('mouse-enter', () => this.rebuildMenu())

    this.unsubscribeMicChange = this.options.store.onDidChange(MICROPHONE_STORE_KEY, () => {
      this.rebuildMenu()
    }) as unknown as () => void

    this.unsubscribeSnapshotChange = this.options.store.onDidChange(SNAPSHOT_STORE_KEY, () => {
      this.rebuildMenu()
    }) as unknown as () => void

    this.unsubscribeUpdateChange = this.options.updateService.subscribe(() => {
      this.rebuildMenu()
    })

    this.attachMainWindowListeners()
    this.rebuildMenu()
  }

  /** Call after `windowManager.createMain()` (or destruction) so the menu state stays in sync. */
  notifyMainWindowChanged(): void {
    this.attachMainWindowListeners()
    this.rebuildMenu()
  }

  dispose(): void {
    this.unsubscribeMicChange?.()
    this.unsubscribeMicChange = null
    this.unsubscribeSnapshotChange?.()
    this.unsubscribeSnapshotChange = null
    this.unsubscribeUpdateChange?.()
    this.unsubscribeUpdateChange = null
    this.detachMainWindowListeners()
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.destroy()
    }
    this.tray = null
  }

  private createTrayImage() {
    const image = nativeImage.createEmpty()
    image.addRepresentation({ scaleFactor: 1, buffer: readFileSync(trayIcon1xPath) })
    image.addRepresentation({ scaleFactor: 2, buffer: readFileSync(trayIcon2xPath) })
    image.setTemplateImage(true)
    return image
  }

  private rebuildMenu(): void {
    if (!this.tray || this.tray.isDestroyed()) return

    const mainWindow = this.options.windowManager.getMain()
    const isMainVisible =
      mainWindow != null &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized()

    const devices = this.getDeviceList()
    const selectedDeviceId = this.getSelectedDeviceId()

    const microphoneSubmenu: MenuItemConstructorOptions[] =
      devices.length === 0
        ? [{ label: 'No microphones found', enabled: false }]
        : devices.map<MenuItemConstructorOptions>((device) => ({
            label: device.label,
            type: 'radio',
            checked: device.portAudioId === selectedDeviceId,
            click: () => this.selectMicrophone(device)
          }))

    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Give feedback',
        click: () => {
          // Click handler intentionally left unwired — feedback channel TBD.
        }
      },
      {
        label: isMainVisible ? 'Hide OpenBroca' : 'Show OpenBroca',
        click: () => this.toggleMainWindow()
      },
      { type: 'separator' },
      { label: 'Select microphone', submenu: microphoneSubmenu },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
      this.getUpdateMenuItem(),
      { type: 'separator' },
      { label: 'Quit OpenBroca', click: () => app.quit() }
    ]

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  private getUpdateMenuItem(): MenuItemConstructorOptions {
    const state = this.options.updateService.getState()
    const version = state.latestVersion ? ` ${state.latestVersion}` : ''

    if (state.status === 'checking') {
      return { label: 'Checking for updates...', enabled: false }
    }

    if (state.status === 'available') {
      return {
        label: `Update to${version || ' latest version'}`,
        click: () => {
          void this.options.updateService.installUpdate()
        }
      }
    }

    if (state.status === 'downloading') {
      const progress = state.downloadProgress != null ? ` ${state.downloadProgress}%` : ''
      return { label: `Downloading update${progress}...`, enabled: false }
    }

    if (state.status === 'downloaded') {
      return {
        label: `Restart to install${version}`,
        click: () => {
          void this.options.updateService.installUpdate()
        }
      }
    }

    if (state.status === 'installing') {
      return { label: 'Installing update...', enabled: false }
    }

    if (state.status === 'unsupported') {
      return { label: 'Updates unavailable', enabled: false }
    }

    return {
      label: 'Check for updates',
      click: () => {
        void this.options.updateService.checkForUpdates()
      }
    }
  }

  private getDeviceList(): AudioDeviceSnapshotEntry[] {
    const snapshot = this.options.store.get(SNAPSHOT_STORE_KEY) as AudioDevicesSnapshot | undefined
    if (snapshot && snapshot.devices.length > 0) {
      return snapshot.devices
    }

    // Fallback for the brief window before the renderer has merged its first
    // snapshot. Browser ids are unknown here — selecting from this fallback
    // leaves selectedBrowserDeviceId null until the renderer catches up.
    try {
      return this.options.captureSource.listDevices().map((device) => ({
        portAudioId: device.id,
        browserDeviceId: null,
        label: device.name,
        isDefault: device.isDefault
      }))
    } catch {
      return []
    }
  }

  private getSelectedDeviceId(): number | null {
    const mic = this.options.store.get(MICROPHONE_STORE_KEY) as
      | PersistedMicrophoneSettings
      | undefined
    return mic?.selectedDeviceId ?? null
  }

  private selectMicrophone(device: AudioDeviceSnapshotEntry): void {
    const next: PersistedMicrophoneSettings = {
      selectedDeviceId: device.portAudioId,
      selectedBrowserDeviceId: device.browserDeviceId
    }
    this.options.store.set(MICROPHONE_STORE_KEY, next as never)
  }

  private toggleMainWindow(): void {
    const mainWindow = this.options.windowManager.getMain()
    if (!mainWindow || mainWindow.isDestroyed()) {
      void this.options.onShowMainRequested()
      return
    }

    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide()
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }

  private readonly handleMainWindowEvent = (): void => {
    this.rebuildMenu()
  }

  private readonly handleMainWindowClosed = (): void => {
    this.currentMainWindow = null
    this.rebuildMenu()
  }

  private attachMainWindowListeners(): void {
    const next = this.options.windowManager.getMain()
    if (next === this.currentMainWindow) return

    this.detachMainWindowListeners()

    if (next && !next.isDestroyed()) {
      next.on('show', this.handleMainWindowEvent)
      next.on('hide', this.handleMainWindowEvent)
      next.on('minimize', this.handleMainWindowEvent)
      next.on('restore', this.handleMainWindowEvent)
      next.on('focus', this.handleMainWindowEvent)
      next.on('blur', this.handleMainWindowEvent)
      next.once('closed', this.handleMainWindowClosed)
      this.currentMainWindow = next
    }
  }

  private detachMainWindowListeners(): void {
    const prev = this.currentMainWindow
    if (!prev || prev.isDestroyed()) {
      this.currentMainWindow = null
      return
    }
    prev.off('show', this.handleMainWindowEvent)
    prev.off('hide', this.handleMainWindowEvent)
    prev.off('minimize', this.handleMainWindowEvent)
    prev.off('restore', this.handleMainWindowEvent)
    prev.off('focus', this.handleMainWindowEvent)
    prev.off('blur', this.handleMainWindowEvent)
    prev.off('closed', this.handleMainWindowClosed)
    this.currentMainWindow = null
  }
}

export { TrayManager }
