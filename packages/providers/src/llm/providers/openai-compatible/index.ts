import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from './factory.ts'

export const openaiCompatibleDescriptor = createOpenAICompatibleDescriptor({
  id: 'openai-compatible',
  displayName: 'Custom Endpoint',
  description: 'Bring your own OpenAI-compatible chat completions endpoint.',
  icon: providerIcons['openai-compatible'],
  defaultBaseUrl: 'http://localhost:11434/v1',
  defaultModelListStrategy: 'api',
  requiresApiKey: false,
  modelDescription: 'Choose a model exposed by your compatible endpoint, or enter a custom model ID.'
})

export {
  createOpenAICompatibleDescriptor,
  type OpenAICompatibleDescriptorDefinition,
  type OpenAICompatibleSettings
} from './factory.ts'
export {
  OpenAICompatibleLLMProvider,
  type OpenAICompatibleConfig,
  type OpenAICompatibleModelListStrategy,
  type OpenAICompatibleProviderOptions,
  type OpenAICompatibleStaticModel
} from './provider.ts'
