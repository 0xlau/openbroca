import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { OpenAICodexLLMProvider, type OpenAICodexConfig } from './provider.ts'
import icon from './icon.svg?raw'

const configSchema = z.object({
  accessToken: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  originator: z.string().min(1).optional()
})

export const openaiCodexDescriptor: LLMProviderDescriptor<OpenAICodexConfig> = {
  id: 'openai-codex',
  icon,
  displayName: 'OpenAI Codex',
  description: 'OpenAI Codex via desktop OAuth',
  configSchema,
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
