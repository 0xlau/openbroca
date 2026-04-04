import type { AppIdentity } from '@openbroca/app-identity'

export type InstructionActivationApp = AppIdentity
export type AutoEnterMode = 'off' | 'enter' | 'mod-enter'

export interface InstructionRule {
  id: string
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnterMode: AutoEnterMode
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

function normalizeAutoEnterMode(rawRule: Record<string, unknown>): AutoEnterMode {
  const rawAutoEnterMode = rawRule.autoEnterMode
  if (rawAutoEnterMode === 'off' || rawAutoEnterMode === 'enter' || rawAutoEnterMode === 'mod-enter') {
    return rawAutoEnterMode
  }

  return rawRule.autoEnter === true ? 'enter' : 'off'
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
      autoEnterMode: normalizeAutoEnterMode(rawRule)
    })
  }

  return { rules }
}
