import type { AppIdentity } from '@openbroca/app-identity'

export type InstructionActivationApp = AppIdentity
export type AutoEnterMode = 'off' | 'enter' | 'mod-enter'

export interface InstructionRule {
  id: string
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnterMode?: AutoEnterMode
  autoEnter?: boolean
}

export interface InstructionsSettings {
  rules: InstructionRule[]
}

export const defaultInstructionsSettings: InstructionsSettings = {
  rules: []
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized ? normalized : undefined
}

export function getInstructionActivationAppStableIdentityKeys(
  app: Pick<InstructionActivationApp, 'id' | 'bundleId' | 'aumid' | 'path'>
): string[] {
  const stableIdentityKeys = new Set<string>()

  const id = normalizeOptionalText(app.id)
  if (id) {
    stableIdentityKeys.add(`id:${id}`)
  }

  const bundleId = normalizeOptionalText(app.bundleId)
  if (bundleId) {
    stableIdentityKeys.add(`bundleId:${bundleId}`)
  }

  const aumid = normalizeOptionalText(app.aumid)
  if (aumid) {
    stableIdentityKeys.add(`aumid:${aumid}`)
  }

  const path = normalizeOptionalText(app.path)
  if (path) {
    stableIdentityKeys.add(`path:${path}`)
  }

  return [...stableIdentityKeys]
}

export function instructionActivationAppsShareStableIdentity(
  left: Pick<InstructionActivationApp, 'id' | 'bundleId' | 'aumid' | 'path'>,
  right: Pick<InstructionActivationApp, 'id' | 'bundleId' | 'aumid' | 'path'>
): boolean {
  const leftKeys = new Set(getInstructionActivationAppStableIdentityKeys(left))
  return getInstructionActivationAppStableIdentityKeys(right).some((key) => leftKeys.has(key))
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
  const usedAppOwnershipKeys = new Set<string>()

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
      if (!appId) {
        continue
      }

      const activationApp: InstructionActivationApp = {
        ...(rawApp as InstructionActivationApp),
        id: appId,
        bundleId: normalizeOptionalText(rawApp.bundleId),
        aumid: normalizeOptionalText(rawApp.aumid),
        path: normalizeOptionalText(rawApp.path)
      }
      const stableIdentityKeys = getInstructionActivationAppStableIdentityKeys(activationApp)
      if (
        stableIdentityKeys.length === 0 ||
        stableIdentityKeys.some((stableIdentityKey) => usedAppOwnershipKeys.has(stableIdentityKey))
      ) {
        continue
      }

      for (const stableIdentityKey of stableIdentityKeys) {
        usedAppOwnershipKeys.add(stableIdentityKey)
      }
      activationApps.push(activationApp)
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
