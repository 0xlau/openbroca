import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const mistralDescriptor = createOpenAICompatibleDescriptor({
  id: 'mistral',
  displayName: 'Mistral AI',
  description: 'Mistral and Codestral models through the OpenAI-compatible chat API.',
  icon: providerIcons.mistral,
  defaultBaseUrl: 'https://api.mistral.ai/v1',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'mistral-large-latest', name: 'Mistral Large' },
    { id: 'mistral-small-latest', name: 'Mistral Small' },
    { id: 'codestral-latest', name: 'Codestral' }
  ]
})
