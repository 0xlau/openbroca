import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const deepseekDescriptor = createOpenAICompatibleDescriptor({
  id: 'deepseek',
  displayName: 'DeepSeek',
  description: 'DeepSeek chat and reasoning models through an OpenAI-compatible endpoint.',
  icon: providerIcons.deepseek,
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }
  ]
})
