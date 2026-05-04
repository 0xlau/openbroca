import { shell, systemPreferences } from 'electron'
import type { PermissionItem } from './types'

// macOS only shows the in-app TCC prompt the first time we ask. Once the user
// has denied (or the system has restricted) microphone access, askForMediaAccess
// resolves false synchronously without any UI. We have to send the user to
// Privacy & Security → Microphone ourselves in that case.
const MAC_MICROPHONE_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'

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
  const status = systemPreferences.getMediaAccessStatus('microphone')

  if (status === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone')
  } else if (status !== 'granted') {
    await shell.openExternal(MAC_MICROPHONE_SETTINGS_URL)
  }

  return resolveMacMicrophonePermission()
}

export function promptMacDesktopControlPermission(): PermissionItem {
  systemPreferences.isTrustedAccessibilityClient(true)
  return resolveMacDesktopControlPermission()
}
