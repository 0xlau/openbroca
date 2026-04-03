import type { InstructionsSettings } from '../../../shared/instructions'
import {
  defaultInstructionsSettings,
  normalizeInstructionsSettings
} from '../../../shared/instructions'
import { createPersistedStore } from './create-persisted-store'

export type { InstructionActivationApp, InstructionRule, InstructionsSettings } from '../../../shared/instructions'

export const instructionsStore = createPersistedStore<InstructionsSettings>({
  key: 'instructions',
  defaults: defaultInstructionsSettings,
  normalize: normalizeInstructionsSettings
})
