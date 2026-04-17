import { createPersistedStore } from './create-persisted-store'
import {
  defaultPromptTemplateSettings,
  defaultPromptTemplateText,
  normalizePromptTemplateSettings,
  promptTemplatePlaceholders,
  type PromptTemplatePlaceholder,
  type PromptTemplateSettings
} from '../../../shared/prompt-template'

export { defaultPromptTemplateSettings, defaultPromptTemplateText, promptTemplatePlaceholders }
export type { PromptTemplatePlaceholder, PromptTemplateSettings }

export const promptsStore = createPersistedStore<PromptTemplateSettings>({
  key: 'prompts',
  defaults: defaultPromptTemplateSettings,
  normalize: normalizePromptTemplateSettings
})
