import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { OpenRouterLLMProvider, type OpenRouterConfig } from './provider.ts'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required')
})

export const openrouterDescriptor: LLMProviderDescriptor<OpenRouterConfig> = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Access OpenRouter models and runtimes via an API key.',
  configSchema,
  capabilities: {
    streaming: true,
    nonStreaming: true,
    functionCalling: true,
    vision: true,
    jsonMode: true
  },
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      description: 'Provide an OpenRouter API key to enable the provider.',
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          input: 'password',
          required: true,
          description: 'Your OpenRouter API key.'
        }
      ]
    }
  ],
  create: (config) => new OpenRouterLLMProvider(config)
}

export { OpenRouterLLMProvider, type OpenRouterConfig } from './provider.ts'
