import { providerIcons } from '../../../shared/icons/index.ts'
import { createOpenAICompatibleDescriptor } from '../openai-compatible/index.ts'

export const geminiDescriptor = createOpenAICompatibleDescriptor({
  id: 'gemini',
  displayName: 'Google Gemini',
  description: 'Gemini models through the Google OpenAI-compatible API.',
  icon: providerIcons['google-gemini'],
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  defaultModelListStrategy: 'static',
  staticModels: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' }
  ],
  apiKeyDescription: 'Provide a Google AI Studio API key to enable Gemini models.'
})
