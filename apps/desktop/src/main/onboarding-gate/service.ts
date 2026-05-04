import {
  promptMacDesktopControlPermission,
  requestMacMicrophonePermission,
  resolveMacDesktopControlPermission,
  resolveMacMicrophonePermission
} from './macos'
import type { OnboardingGateSnapshot, OnboardingMode, PermissionItem } from './types'
import type { OnboardingState } from '../../shared/onboarding'

export type StoreReader = () => OnboardingState

export async function resolveOnboardingGateSnapshot(
  readStore: StoreReader,
  platform: NodeJS.Platform = process.platform
): Promise<OnboardingGateSnapshot> {
  const permissions: PermissionItem[] =
    platform === 'darwin'
      ? [resolveMacMicrophonePermission(), resolveMacDesktopControlPermission()]
      : []

  const permissionsOk = platform !== 'darwin' || permissions.every((p) => p.status === 'granted')
  const hasCompletedOnboarding = readStore().completedAt !== null

  let mode: OnboardingMode
  let canEnterMainWindow: boolean
  if (!hasCompletedOnboarding) {
    mode = 'first-run'
    canEnterMainWindow = false
  } else if (permissionsOk) {
    mode = 'none'
    canEnterMainWindow = true
  } else {
    mode = 'permission-recovery'
    canEnterMainWindow = false
  }

  return {
    mode,
    canEnterMainWindow,
    permissionsOk,
    hasCompletedOnboarding,
    permissions,
    platform
  }
}

function createNonMacMicrophonePermission(): PermissionItem {
  return {
    key: 'microphone',
    title: 'Microphone',
    description: 'Required to capture your voice.',
    status: 'granted'
  }
}

function createNonMacDesktopControlPermission(): PermissionItem {
  return {
    key: 'desktopControl',
    title: 'Desktop Control',
    description: 'Required to paste the final text into your current app.',
    status: 'granted'
  }
}

export async function requestMicrophonePermission(): Promise<PermissionItem> {
  if (process.platform !== 'darwin') return createNonMacMicrophonePermission()
  return requestMacMicrophonePermission()
}

export function requestDesktopControlPermission(): PermissionItem {
  if (process.platform !== 'darwin') return createNonMacDesktopControlPermission()
  return promptMacDesktopControlPermission()
}
