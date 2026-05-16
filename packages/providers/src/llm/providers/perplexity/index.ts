import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const perplexityDescriptor = createOpenAICompatibleDescriptor({
  id: 'perplexity',
  displayName: 'Perplexity',
  description: 'Sonar models with web-grounded answers through Perplexity APIs.',
  icon: providerIcons.perplexity,
  defaultBaseUrl: 'https://api.perplexity.ai',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'sonar', name: 'Sonar' },
    { id: 'sonar-pro', name: 'Sonar Pro' },
    { id: 'sonar-reasoning', name: 'Sonar Reasoning' },
    { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' }
  ]
})
