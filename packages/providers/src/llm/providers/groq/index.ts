import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const groqDescriptor = createOpenAICompatibleDescriptor({
  id: 'groq',
  displayName: 'Groq',
  description: 'Low-latency hosted inference through Groq OpenAI-compatible APIs.',
  icon: providerIcons.groq,
  defaultBaseUrl: 'https://api.groq.com/openai/v1',
  defaultModelListStrategy: 'api',
  staticModels: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
    { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' }
  ]
})
