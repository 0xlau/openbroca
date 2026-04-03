import type { InstructionsSettings } from '../../../shared/instructions'
import {
  defaultInstructionsSettings,
  normalizeInstructionsSettings
} from '../../../shared/instructions'
import { createPersistedStore } from './create-persisted-store'

export type { InstructionActivationApp, InstructionRule, InstructionsSettings } from '../../../shared/instructions'

const instructionsStoreBase = createPersistedStore<InstructionsSettings>({
  key: 'instructions',
  defaults: defaultInstructionsSettings,
  normalize: normalizeInstructionsSettings
})

const baseReplace = instructionsStoreBase.getState().replace

async function updateInstructionsSettingsSafely(partial: Partial<InstructionsSettings>): Promise<void> {
  const current = instructionsStoreBase.getState().data
  const next = normalizeInstructionsSettings({
    ...current,
    ...partial
  })

  await baseReplace(next)
}

async function replaceInstructionsSettingsSafely(data: InstructionsSettings): Promise<void> {
  await baseReplace(normalizeInstructionsSettings(data))
}

instructionsStoreBase.setState({
  update: updateInstructionsSettingsSafely,
  replace: replaceInstructionsSettingsSafely
})

export const instructionsStore = instructionsStoreBase
