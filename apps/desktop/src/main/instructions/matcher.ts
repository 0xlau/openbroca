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

export function createInstructionMatcher(
  deps: InstructionMatcherDeps
): () => Promise<MatchedInstructionRule | null> {
  return async () => {
    const frontmostApp = await deps.getFrontmostApp()
    if (!frontmostApp?.id) {
      return null
    }

    const matches = deps
      .getInstructions()
      .rules.filter((rule) => rule.activationApps.some((app) => app.id === frontmostApp.id))

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
