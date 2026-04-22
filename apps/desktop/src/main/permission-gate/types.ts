export type PermissionKey = 'microphone' | 'desktopControl'

export type PermissionStatus = 'granted' | 'missing' | 'needs-manual-step' | 'error'

export type PermissionItem = {
  key: PermissionKey
  title: string
  description: string
  status: PermissionStatus
  errorMessage?: string
}

export type PermissionGateSnapshot = {
  platform: NodeJS.Platform
  shouldGate: boolean
  canEnterMainWindow: boolean
  permissions: PermissionItem[]
}
