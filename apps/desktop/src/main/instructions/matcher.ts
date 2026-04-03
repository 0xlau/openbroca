import type { AppIdentity } from '@openbroca/app-identity'
import type { InstructionsSettings } from '../../shared/instructions'

interface InstructionMatcherDeps {
  getInstructions: () => InstructionsSettings
  getFrontmostApp: () => Promise<AppIdentity | null>
}

export interface MatchedInstructionRule {
  ruleId: string
  name: string
  customInstructions: string
  autoEnter: boolean
}

function appIdentityMatches(ruleApp: AppIdentity, frontmostApp: AppIdentity): boolean {
  if (ruleApp.id === frontmostApp.id) {
    return true
  }

  if (ruleApp.bundleId && frontmostApp.bundleId && ruleApp.bundleId === frontmostApp.bundleId) {
    return true
  }

  if (ruleApp.aumid && frontmostApp.aumid && ruleApp.aumid === frontmostApp.aumid) {
    return true
  }

  if (ruleApp.path && frontmostApp.path && ruleApp.path === frontmostApp.path) {
    return true
  }

  return false
}

export function createInstructionMatcher(
  deps: InstructionMatcherDeps
): (frontmostAppSnapshot?: AppIdentity | null) => Promise<MatchedInstructionRule | null> {
  return async (frontmostAppSnapshot) => {
    const frontmostApp =
      frontmostAppSnapshot === undefined ? await deps.getFrontmostApp() : frontmostAppSnapshot
    if (!frontmostApp?.id) {
      return null
    }

    const matches = deps
      .getInstructions()
      .rules.filter((rule) => rule.activationApps.some((app) => appIdentityMatches(app, frontmostApp)))

    if (matches.length !== 1) {
      return null
    }

    const [match] = matches
    return {
      ruleId: match.id,
      name: match.name,
      customInstructions: match.customInstructions,
      autoEnter: match.autoEnter
    }
  }
}
