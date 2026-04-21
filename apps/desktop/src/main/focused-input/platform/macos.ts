import type { RawAppIdentity } from '@openbroca/app-identity'

const IMPLIED_EDITABLE_MAC_ROLES = ['AXTextField', 'AXTextArea', 'AXSearchField'] as const

type RawFocusedMacInput = {
  app: RawAppIdentity
  element: {
    role: string | null
    subrole: string | null
    editable: boolean | null
    valueSettable: boolean
    selectedTextRange: string | null
  }
}

export function isLikelyMacEditableRole(role: unknown, editable: unknown): boolean {
  if (typeof role !== 'string') {
    return false
  }

  if (editable === false) {
    return false
  }

  if (IMPLIED_EDITABLE_MAC_ROLES.includes(role as (typeof IMPLIED_EDITABLE_MAC_ROLES)[number])) {
    return true
  }

  if (role === 'AXWebArea') {
    return editable === true
  }

  return false
}

export function parseFocusedElementPayload(stdout: string): RawFocusedMacInput | null {
  if (!stdout.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(stdout) as {
      ok?: boolean
      command?: string
      payload?: RawFocusedMacInput
    }
    if (!parsed.ok || parsed.command !== 'focused-element' || !parsed.payload) {
      return null
    }

    if (!isLikelyMacEditableRole(parsed.payload.element.role, parsed.payload.element.editable)) {
      return null
    }

    return parsed.payload
  } catch {
    return null
  }
}

export async function resolveMacFocusedInputDetails(): Promise<RawFocusedMacInput | null> {
  return null
}

export async function resolveMacFocusedInputApp(): Promise<RawAppIdentity | null> {
  return null
}
