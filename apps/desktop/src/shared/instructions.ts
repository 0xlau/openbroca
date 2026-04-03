import type { AppIdentity } from '@openbroca/app-identity'

export type InstructionActivationApp = AppIdentity

export interface InstructionRule {
  id: string
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnter: boolean
}

export interface InstructionsSettings {
  rules: InstructionRule[]
}

export const defaultInstructionsSettings: InstructionsSettings = {
  rules: []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeInstructionsSettings(raw: unknown): InstructionsSettings {
  if (!isRecord(raw) || !Array.isArray(raw.rules)) {
    return defaultInstructionsSettings
  }

  const rules: InstructionRule[] = []
  const usedAppIds = new Set<string>()

  for (const rawRule of raw.rules) {
    if (!isRecord(rawRule)) {
      continue
    }

    const name = typeof rawRule.name === 'string' ? rawRule.name.trim() : ''
    if (!name) {
      continue
    }

    const activationApps: InstructionActivationApp[] = []
    const rawActivationApps = Array.isArray(rawRule.activationApps) ? rawRule.activationApps : []

    for (const rawApp of rawActivationApps) {
      if (!isRecord(rawApp) || typeof rawApp.id !== 'string') {
        continue
      }

      const appId = rawApp.id.trim()
      if (!appId || usedAppIds.has(appId)) {
        continue
      }

      usedAppIds.add(appId)
      activationApps.push({
        ...(rawApp as InstructionActivationApp),
        id: appId
      })
    }

    rules.push({
      id: typeof rawRule.id === 'string' ? rawRule.id : '',
      name,
      activationApps,
      customInstructions: typeof rawRule.customInstructions === 'string' ? rawRule.customInstructions : '',
      autoEnter: Boolean(rawRule.autoEnter)
    })
  }

  return { rules }
}
