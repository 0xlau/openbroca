import { systemPreferences } from 'electron'
import type { PermissionItem } from './types'

export function resolveMacMicrophonePermission(): PermissionItem {
  const status = systemPreferences.getMediaAccessStatus('microphone')

  if (status === 'granted') {
    return {
      key: 'microphone',
      title: 'Microphone',
      description: 'Required to capture your voice.',
      status: 'granted'
    }
  }

  return {
    key: 'microphone',
    title: 'Microphone',
    description: 'Required to capture your voice.',
    status: status === 'not-determined' ? 'missing' : 'needs-manual-step'
  }
}

export function resolveMacDesktopControlPermission(): PermissionItem {
  return {
    key: 'desktopControl',
    title: 'Desktop Control',
    description: 'Required to paste the final text into your current app.',
    status: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'needs-manual-step'
  }
}

export async function requestMacMicrophonePermission(): Promise<PermissionItem> {
  await systemPreferences.askForMediaAccess('microphone')
  return resolveMacMicrophonePermission()
}

export function promptMacDesktopControlPermission(): PermissionItem {
  systemPreferences.isTrustedAccessibilityClient(true)
  return resolveMacDesktopControlPermission()
}
