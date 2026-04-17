import { createPersistedStore } from './create-persisted-store'
import {
  defaultPromptTemplateSettings,
  normalizePromptTemplateSettings,
  type PromptTemplateSettings
} from '../../../shared/prompt-template'

export { defaultPromptTemplateSettings }
export type { PromptTemplateSettings }

export const promptsStore = createPersistedStore<PromptTemplateSettings>({
  key: 'prompts',
  defaults: defaultPromptTemplateSettings,
  normalize: normalizePromptTemplateSettings
})
