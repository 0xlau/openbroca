import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const fireworksDescriptor = createOpenAICompatibleDescriptor({
  id: 'fireworks',
  displayName: 'Fireworks AI',
  description: 'Serverless and dedicated model inference through Fireworks AI.',
  icon: providerIcons.fireworks,
  defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
  defaultModelListStrategy: 'api',
  staticModels: [
    { id: 'accounts/fireworks/models/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct' },
    { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'accounts/fireworks/models/qwen3-235b-a22b', name: 'Qwen3 235B A22B' }
  ]
})
