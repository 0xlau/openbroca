import { createPersistedStore } from './create-persisted-store'
import {
  defaultPromptTemplateSettings,
  defaultPromptTemplateText,
  normalizePromptTemplateSettings,
  type PromptTemplateSettings
} from '../../../shared/prompt-template'

export { defaultPromptTemplateSettings, defaultPromptTemplateText }
export type { PromptTemplateSettings }

export const promptsStore = createPersistedStore<PromptTemplateSettings>({
  key: 'prompts',
  defaults: defaultPromptTemplateSettings,
  normalize: normalizePromptTemplateSettings
})
