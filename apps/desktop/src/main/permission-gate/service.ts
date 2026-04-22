import {
  promptMacDesktopControlPermission,
  requestMacMicrophonePermission,
  resolveMacDesktopControlPermission,
  resolveMacMicrophonePermission
} from './macos'
import type { PermissionGateSnapshot, PermissionItem } from './types'

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

export async function resolvePermissionGateSnapshot(): Promise<PermissionGateSnapshot> {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      shouldGate: false,
      canEnterMainWindow: true,
      permissions: []
    }
  }

  const permissions = [resolveMacMicrophonePermission(), resolveMacDesktopControlPermission()]

  return {
    platform: process.platform,
    shouldGate: permissions.some((item) => item.status !== 'granted'),
    canEnterMainWindow: permissions.every((item) => item.status === 'granted'),
    permissions
  }
}

export async function requestMicrophonePermission(): Promise<PermissionItem> {
  if (process.platform !== 'darwin') {
    return createNonMacMicrophonePermission()
  }

  return requestMacMicrophonePermission()
}

export function requestDesktopControlPermission(): PermissionItem {
  if (process.platform !== 'darwin') {
    return createNonMacDesktopControlPermission()
  }

  return promptMacDesktopControlPermission()
}
