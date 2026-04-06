import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import { OpenRouterLLMProvider, type OpenRouterConfig } from './provider.ts'

const configSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required')
})

const settingsSchema = z.object({
  model: z.string().trim().min(1, 'Choose a model')
})

type OpenRouterSettings = z.infer<typeof settingsSchema>

export const openrouterDescriptor: LLMProviderDescriptor<OpenRouterConfig, OpenRouterSettings> = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Access OpenRouter models and runtimes via an API key.',
  icon: providerIcons.openrouter,
  configSchema,
  settingsSchema,
  settingsItems: [
    {
      key: 'model',
      type: 'model-select',
      label: 'Model',
      description: 'Choose the default OpenRouter model (for example `openai/gpt-4o-mini`).',
      required: true,
      dataSource: 'llm-models'
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
