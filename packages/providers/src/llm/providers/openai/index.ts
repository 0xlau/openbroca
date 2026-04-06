import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import { OpenAILLMProvider, type OpenAIConfig } from './provider.ts'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional()
})

export const openaiDescriptor: LLMProviderDescriptor<OpenAIConfig> = {
  id: 'openai',
  displayName: 'OpenAI',
  description: 'GPT-4o, o-series, and other models via the OpenAI API',
  icon: providerIcons.openai,
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
      description: 'Enter an OpenAI API key to enable GPT models in OpenBroca.',
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          input: 'password',
          required: true,
          description: 'Your OpenAI secret key.'
        },
        {
          key: 'baseUrl',
          label: 'Base URL',
          input: 'url',
          placeholder: 'https://api.openai.com/v1',
          description: 'Optional. Override the API base URL for compatible endpoints.'
        },
        {
          key: 'organization',
          label: 'Organization',
          input: 'text',
          description: 'Optional. Set the OpenAI organization to bill against.'
        }
      ]
    }
  ],
  create: (config) => new OpenAILLMProvider(config)
}

export { OpenAILLMProvider, type OpenAIConfig } from './provider.ts'
