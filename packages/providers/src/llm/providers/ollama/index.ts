import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const ollamaDescriptor = createOpenAICompatibleDescriptor({
  id: 'ollama',
  displayName: 'Ollama',
  description: 'Local models served by Ollama through its OpenAI-compatible API.',
  icon: providerIcons.ollama,
  defaultBaseUrl: 'http://localhost:11434/v1',
  defaultModelListStrategy: 'api',
  requiresApiKey: false,
  staticModels: [
    { id: 'llama3.3', name: 'Llama 3.3' },
    { id: 'qwen3', name: 'Qwen3' },
    { id: 'deepseek-r1', name: 'DeepSeek R1' }
  ],
  apiKeyDescription: 'Connect to a local Ollama server. API key is optional and ignored by Ollama.'
})
