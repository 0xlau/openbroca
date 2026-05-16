import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import { OpenAILLMProvider, type OpenAIConfig } from './provider.ts'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional()
})

const settingsSchema = z.object({
  model: z.string().trim().min(1, 'Choose a model')
})

type OpenAISettings = z.infer<typeof settingsSchema>

export const openaiDescriptor: LLMProviderDescriptor<OpenAIConfig, OpenAISettings> = {
  id: 'openai',
  displayName: 'OpenAI',
  description: 'GPT-4o, o-series, and other models via the OpenAI API',
  icon: providerIcons.openai,
  configSchema,
  settingsSchema,
  settingsItems: [
    {
      key: 'model',
      type: 'model-select',
      label: 'Model',
      description: 'Choose the default OpenAI model used for chat completions, or enter a custom model ID.',
      required: true,
      dataSource: 'llm-models',
      allowCustomValue: true
    }
  ],
  getSetupStatus: ({ settings }) => {
    const model = typeof settings?.model === 'string' ? settings.model.trim() : ''

    if (!model) {
      return {
        status: 'configured',
        canActivate: false,
        summary: 'Select a model to finish setup.',
        blockingReasons: ['Choose a model'],
        fieldErrors: { model: 'Choose a model' }
      }
    }

    return {
      status: 'ready',
      canActivate: true,
      summary: 'Ready to use.',
      blockingReasons: []
    }
  },
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
          description: 'Optional. Override the API base URL for compatible endpoints.',
          advanced: true
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
