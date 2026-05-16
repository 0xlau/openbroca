import { app } from 'electron'
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from 'electron-updater'
import type { AppUpdateState, AppUpdateStatus } from '../shared/app-update'

const BUSY_STATUSES = new Set<AppUpdateStatus>(['checking', 'downloading', 'installing'])
const UPDATE_AVAILABLE_STATUSES = new Set<AppUpdateStatus>([
  'available',
  'downloading',
  'downloaded',
  'installing'
])

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Update failed'
}

function normalizeProgress(percent: number | undefined): number | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return null
  }

  return Math.max(0, Math.min(100, Math.round(percent)))
}

function getCurrentVersion(): string {
  try {
    return typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

class AppUpdateService {
  private started = false
  private installAfterDownload = false
  private listeners = new Set<(state: AppUpdateState) => void>()
  private state: AppUpdateState = this.withCapabilities({
    status: 'idle',
    currentVersion: getCurrentVersion(),
    latestVersion: null,
    releaseDate: null,
    downloadProgress: null,
    errorMessage: null,
    unsupportedReason: null,
    lastCheckedAt: null,
    isUpdateAvailable: false,
    canCheck: true,
    canDownload: false,
    canInstall: false
  })

  start(): void {
    if (this.started) return
    this.started = true

    const unsupportedReason = this.resolveUnsupportedReason()
    if (unsupportedReason) {
      this.setState({ status: 'unsupported', unsupportedReason })
      return
    }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
    }

    autoUpdater.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        errorMessage: null,
        downloadProgress: null,
        lastCheckedAt: new Date().toISOString()
      })
    })

    autoUpdater.on('update-available', (info) => {
      this.setUpdateInfo('available', info)
    })

    autoUpdater.on('update-not-available', (info) => {
      this.setUpdateInfo('not-available', info)
    })

    autoUpdater.on('download-progress', (info) => {
      this.setDownloadProgress(info)
    })

    autoUpdater.on('update-downloaded', (event) => {
      this.setDownloaded(event)
      if (this.installAfterDownload) {
        this.installAfterDownload = false
        setImmediate(() => this.installDownloadedUpdate())
      }
    })

    autoUpdater.on('update-cancelled', (info) => {
      this.installAfterDownload = false
      this.setUpdateInfo('available', info)
    })

    autoUpdater.on('error', (error) => {
      this.installAfterDownload = false
      this.setState({
        status: 'error',
        errorMessage: normalizeErrorMessage(error),
        downloadProgress: null
      })
    })
  }

  getState(): AppUpdateState {
    return { ...this.state }
  }

  subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    if (!this.ensureSupported()) {
      return this.getState()
    }

    if (BUSY_STATUSES.has(this.state.status) || this.state.status === 'downloaded') {
      return this.getState()
    }

    this.setState({
      status: 'checking',
      errorMessage: null,
      downloadProgress: null,
      lastCheckedAt: new Date().toISOString()
    })

    try {
      const result = await autoUpdater.checkForUpdates()
      if (result === null) {
        this.setState({
          status: 'unsupported',
          unsupportedReason: 'Updater is not active for this build.'
        })
      }
    } catch (error) {
      this.setState({
        status: 'error',
        errorMessage: normalizeErrorMessage(error),
        downloadProgress: null
      })
    }

    return this.getState()
  }

  async installUpdate(): Promise<AppUpdateState> {
    if (!this.ensureSupported()) {
      return this.getState()
    }

    if (this.state.status === 'downloaded') {
      this.installDownloadedUpdate()
      return this.getState()
    }

    if (this.state.status === 'downloading' || this.state.status === 'installing') {
      return this.getState()
    }

    this.installAfterDownload = true

    if (!this.state.isUpdateAvailable) {
      await this.checkForUpdates()
    }

    if (this.state.status !== 'available') {
      this.installAfterDownload = false
      return this.getState()
    }

    await this.downloadUpdate()
    return this.getState()
  }

  private async downloadUpdate(): Promise<void> {
    this.setState({ status: 'downloading', downloadProgress: 0, errorMessage: null })

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.installAfterDownload = false
      this.setState({
        status: 'error',
        errorMessage: normalizeErrorMessage(error),
        downloadProgress: null
      })
    }
  }

  private installDownloadedUpdate(): void {
    this.setState({ status: 'installing', errorMessage: null, downloadProgress: 100 })
    autoUpdater.quitAndInstall(false, true)
  }

  private setUpdateInfo(status: AppUpdateStatus, info: UpdateInfo): void {
    this.setState({
      status,
      latestVersion: info.version ?? null,
      releaseDate: info.releaseDate ?? null,
      downloadProgress: null,
      errorMessage: null,
      unsupportedReason: null
    })
  }

  private setDownloadProgress(info: ProgressInfo): void {
    this.setState({
      status: 'downloading',
      downloadProgress: normalizeProgress(info.percent),
      errorMessage: null
    })
  }

  private setDownloaded(event: UpdateDownloadedEvent): void {
    this.setState({
      status: 'downloaded',
      latestVersion: event.version ?? this.state.latestVersion,
      releaseDate: event.releaseDate ?? this.state.releaseDate,
      downloadProgress: 100,
      errorMessage: null
    })
  }

  private ensureSupported(): boolean {
    const unsupportedReason = this.resolveUnsupportedReason()
    if (!unsupportedReason) {
      return true
    }

    this.setState({ status: 'unsupported', unsupportedReason })
    return false
  }

  private resolveUnsupportedReason(): string | null {
    if (!app.isPackaged && process.env.OPENBROCA_FORCE_DEV_UPDATES !== 'true') {
      return 'Updates are available in packaged builds.'
    }

    if (
      process.platform !== 'darwin' &&
      process.platform !== 'win32' &&
      process.platform !== 'linux'
    ) {
      return `Updates are not supported on ${process.platform}.`
    }

    if (
      process.platform === 'linux' &&
      !process.env.APPIMAGE &&
      process.env.OPENBROCA_FORCE_DEV_UPDATES !== 'true'
    ) {
      return 'Linux updates require the AppImage runtime.'
    }

    return null
  }

  private setState(partial: Partial<AppUpdateState>): void {
    this.state = this.withCapabilities({ ...this.state, ...partial })
    this.publish()
  }

  private withCapabilities(state: AppUpdateState): AppUpdateState {
    const isUnsupported = state.status === 'unsupported'
    const isBusy = BUSY_STATUSES.has(state.status)

    return {
      ...state,
      isUpdateAvailable: UPDATE_AVAILABLE_STATUSES.has(state.status),
      canCheck: !isUnsupported && !isBusy && state.status !== 'downloaded',
      canDownload: state.status === 'available',
      canInstall: state.status === 'downloaded'
    }
  }

  private publish(): void {
    const snapshot = this.getState()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export { AppUpdateService }
