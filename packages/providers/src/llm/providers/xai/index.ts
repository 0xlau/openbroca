import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const xaiDescriptor = createOpenAICompatibleDescriptor({
  id: 'xai',
  displayName: 'xAI',
  description: 'Grok models through the xAI OpenAI-compatible API.',
  icon: providerIcons.xai,
  defaultBaseUrl: 'https://api.x.ai/v1',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'grok-4.20-reasoning', name: 'Grok 4.20 Reasoning' },
    { id: 'grok-4', name: 'Grok 4' },
    { id: 'grok-3-mini', name: 'Grok 3 Mini' }
  ]
})
