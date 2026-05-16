export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  downloadProgress: number | null
  errorMessage: string | null
  unsupportedReason: string | null
  lastCheckedAt: string | null
  isUpdateAvailable: boolean
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
}

export function isVisibleUpdateState(state: AppUpdateState | null | undefined): boolean {
  return (
    state?.status === 'available' ||
    state?.status === 'downloading' ||
    state?.status === 'downloaded' ||
    state?.status === 'installing'
  )
}
