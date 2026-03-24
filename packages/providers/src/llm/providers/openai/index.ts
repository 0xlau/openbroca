/// <reference path="../../../shared/assets.d.ts" />
import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { OpenAILLMProvider, type OpenAIConfig } from './provider.ts'
import icon from './icon.svg?raw'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional(),
})

export const openaiDescriptor: LLMProviderDescriptor<OpenAIConfig> = {
  id: 'openai',
  displayName: 'OpenAI',
  description: 'GPT-4o, o-series, and other models via the OpenAI API',
  icon,
  configSchema,
  capabilities: {
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonMode: true,
  },
  create: (config) => new OpenAILLMProvider(config),
}

export { OpenAILLMProvider, type OpenAIConfig } from './provider.ts'
