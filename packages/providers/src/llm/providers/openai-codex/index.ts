import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import { OpenAICodexLLMProvider, type OpenAICodexConfig } from './provider.ts'

const configSchema = z.object({
  accessToken: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  originator: z.string().min(1).optional()
})

const settingsSchema = z.object({
  model: z.string().trim().min(1, 'Choose a model')
})

type OpenAICodexSettings = z.infer<typeof settingsSchema>

export const openaiCodexDescriptor: LLMProviderDescriptor<OpenAICodexConfig, OpenAICodexSettings> = {
  id: 'openai-codex',
  icon: providerIcons['openai-codex'],
  displayName: 'OpenAI Codex',
  description: 'OpenAI Codex via desktop OAuth',
  configSchema,
  settingsSchema,
  settingsItems: [
    {
      key: 'model',
      type: 'model-select',
      label: 'Model',
      description: 'Choose the default Codex model used for completions.',
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
  connectionOptions: [
    {
      type: 'oauth',
      label: 'OpenAI Account',
      description: 'Sign in with your ChatGPT account to connect OpenAI Codex.',
      buttonLabel: 'Continue in browser',
      flow: 'systemBrowser'
    }
  ],
  create: (config) => new OpenAICodexLLMProvider(config)
}

export { OpenAICodexLLMProvider, type OpenAICodexConfig } from './provider.ts'
