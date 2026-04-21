import type { AppIdentity } from '@openbroca/app-identity'
import type { AutoEnterMode, InstructionsSettings } from '../../shared/instructions'

interface InstructionMatcherDeps {
  getInstructions: () => InstructionsSettings
  getFrontmostApp: () => Promise<AppIdentity | null>
}

export interface MatchedInstructionRule {
  ruleId: string
  name: string
  customInstructions: string
  autoEnterMode: AutoEnterMode
  activationApp: AppIdentity
}

function createMatchedInstructionRule(
  match: InstructionsSettings['rules'][number],
  activationApp: AppIdentity
): MatchedInstructionRule {
  return {
    ruleId: match.id,
    name: match.name,
    customInstructions: match.customInstructions,
    autoEnterMode: match.autoEnterMode ?? 'off',
    activationApp
  }
}

function appIdentityMatches(ruleApp: AppIdentity, targetApp: AppIdentity): boolean {
  if (ruleApp.id === targetApp.id) {
    return true
  }

  if (ruleApp.bundleId && targetApp.bundleId && ruleApp.bundleId === targetApp.bundleId) {
    return true
  }

  if (ruleApp.aumid && targetApp.aumid && ruleApp.aumid === targetApp.aumid) {
    return true
  }

  if (ruleApp.path && targetApp.path && ruleApp.path === targetApp.path) {
    return true
  }

  return false
}

export function createInstructionMatcher(
  deps: InstructionMatcherDeps
): (targetAppSnapshot?: AppIdentity | null) => Promise<MatchedInstructionRule | null> {
  return async (targetAppSnapshot) => {
    const targetApp =
      targetAppSnapshot === undefined ? await deps.getFrontmostApp() : targetAppSnapshot
    if (!targetApp?.id) {
      return null
    }

    const matches = deps.getInstructions().rules
      .map((rule) => {
        const activationApp = rule.activationApps.find((app) => appIdentityMatches(app, targetApp))
        return activationApp ? { rule, activationApp } : null
      })
      .filter(
        (
          match
        ): match is { rule: InstructionsSettings['rules'][number]; activationApp: AppIdentity } =>
          Boolean(match)
      )

    if (matches.length !== 1) {
      return null
    }

    const [match] = matches
    return createMatchedInstructionRule(match.rule, match.activationApp)
  }
}
