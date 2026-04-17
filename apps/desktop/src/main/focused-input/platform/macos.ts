import { execFile as nodeExecFile } from 'node:child_process'
import type { RawAppIdentity } from '@openbroca/app-identity'

const IMPLIED_EDITABLE_MAC_ROLES = ['AXTextField', 'AXTextArea', 'AXSearchField'] as const

export function isLikelyMacEditableRole(role: unknown, editable: unknown): boolean {
  if (editable === true) {
    return true
  }

  if (editable === false) {
    return false
  }

  return typeof role === 'string' && IMPLIED_EDITABLE_MAC_ROLES.includes(role as (typeof IMPLIED_EDITABLE_MAC_ROLES)[number])
}

export const MAC_FOCUSED_INPUT_JXA_SCRIPT = `
ObjC.import('AppKit')

const impliedEditableRoles = ${JSON.stringify([...IMPLIED_EDITABLE_MAC_ROLES])}

function readAttribute(target, name) {
  try {
    return target.attributes.byName(name).value()
  } catch (_) {
    return null
  }
}

function hasEditableRole(role, editable) {
  if (editable === false) {
    return false
  }

  return editable === true || impliedEditableRoles.indexOf(role) >= 0
}

function run() {
  try {
    const workspace = $.NSWorkspace.sharedWorkspace
    const app = workspace.frontmostApplication
    if (!app) {
      return ''
    }

    const bundleId = ObjC.unwrap(app.bundleIdentifier) || ''
    const path = app.bundleURL ? ObjC.unwrap(app.bundleURL.path) || '' : ''
    const displayName = ObjC.unwrap(app.localizedName) || bundleId || path
    if (!displayName) {
      return ''
    }

    const systemEvents = Application('System Events')
    if (!systemEvents.UIElementsEnabled()) {
      return ''
    }

    const process = systemEvents.applicationProcesses.byName(displayName)
    if (!process.exists()) {
      return ''
    }

    const focusedElement = readAttribute(process, 'AXFocusedUIElement')
    if (!focusedElement) {
      return ''
    }

    const role = readAttribute(focusedElement, 'AXRole')
    const editable = readAttribute(focusedElement, 'AXEditable')
    if (!hasEditableRole(role, editable)) {
      return ''
    }

    return JSON.stringify({
      displayName: displayName,
      platform: 'macos',
      bundleId: bundleId || undefined,
      path: path || undefined,
      source: 'detected'
    })
  } catch (_) {
    return ''
  }
}
`

function execFile(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    nodeExecFile(file, args, { timeout: 1000 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve(stdout ?? '')
    })
  })
}

function parseFocusedInputApp(stdout: string): RawAppIdentity | null {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as RawAppIdentity
    if (parsed.platform !== 'macos' || parsed.source !== 'detected') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function resolveMacFocusedInputApp(): Promise<RawAppIdentity | null> {
  try {
    const stdout = await execFile('osascript', ['-l', 'JavaScript', '-e', MAC_FOCUSED_INPUT_JXA_SCRIPT])
    return parseFocusedInputApp(stdout)
  } catch {
    return null
  }
}
