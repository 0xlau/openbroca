import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const kimiDescriptor = createOpenAICompatibleDescriptor({
  id: 'kimi',
  displayName: 'Moonshot Kimi',
  description: 'Moonshot Kimi models through an OpenAI-compatible endpoint.',
  icon: providerIcons.kimi,
  defaultBaseUrl: 'https://api.moonshot.cn/v1',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'kimi-k2-0711-preview', name: 'Kimi K2' },
    { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K' },
    { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K' },
    { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K' }
  ]
})
