import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const togetherDescriptor = createOpenAICompatibleDescriptor({
  id: 'together',
  displayName: 'Together AI',
  description: 'Hosted open-source models through Together AI.',
  icon: providerIcons.together,
  defaultBaseUrl: 'https://api.together.xyz/v1',
  defaultModelListStrategy: 'api',
  staticModels: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Instruct Turbo' },
    { id: 'Qwen/Qwen3-235B-A22B-fp8-tput', name: 'Qwen3 235B A22B' },
    { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct' }
  ]
})
