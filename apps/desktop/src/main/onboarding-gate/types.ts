export type PermissionKey = 'microphone' | 'desktopControl'

export type PermissionStatus = 'granted' | 'missing' | 'needs-manual-step' | 'error'

export type PermissionItem = {
  key: PermissionKey
  title: string
  description: string
  status: PermissionStatus
  errorMessage?: string
}

export type OnboardingMode = 'first-run' | 'permission-recovery' | 'none'

export interface OnboardingGateSnapshot {
  mode: OnboardingMode
  canEnterMainWindow: boolean
  permissionsOk: boolean
  hasCompletedOnboarding: boolean
  permissions: PermissionItem[]
  platform: NodeJS.Platform
}
