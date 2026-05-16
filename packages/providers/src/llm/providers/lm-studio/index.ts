import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const lmStudioDescriptor = createOpenAICompatibleDescriptor({
  id: 'lm-studio',
  displayName: 'LM Studio',
  description: 'Local models served by LM Studio through an OpenAI-compatible API.',
  icon: providerIcons['lm-studio'],
  defaultBaseUrl: 'http://localhost:1234/v1',
  defaultModelListStrategy: 'api',
  requiresApiKey: false,
  apiKeyDescription: 'Connect to a local LM Studio server. API key is optional for local endpoints.'
})
