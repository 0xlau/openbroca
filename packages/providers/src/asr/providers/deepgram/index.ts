import { z } from 'zod'
import type { ASRProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import { DeepgramASRProvider, type DeepgramConfig } from './provider.ts'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required')
})

const SUPPORTED_LANGUAGES = ['en', 'zh'] as const

const settingsSchema = z.object({
  language: z.string().trim().pipe(z.enum(SUPPORTED_LANGUAGES)).optional()
})

type DeepgramSettings = z.infer<typeof settingsSchema>

export const deepgramDescriptor: ASRProviderDescriptor<DeepgramConfig, DeepgramSettings> = {
  id: 'deepgram',
  displayName: 'Deepgram',
  description: 'Real-time speech recognition via the Deepgram Nova API',
  icon: providerIcons.deepgram,
  kind: 'cloud',
  configSchema,
  settingsSchema,
  settingsItems: [
    {
      key: 'language',
      type: 'select',
      label: 'Language',
      description: 'Default language used when the runtime does not override it.',
      options: [
        { label: 'English (en)', value: 'en' },
        { label: 'Chinese (zh)', value: 'zh' }
      ]
    }
  ],
  getSetupStatus: () => ({
    status: 'ready',
    canActivate: true,
    summary: 'Ready to use.',
    blockingReasons: []
  }),
  capabilities: { streaming: true },
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      description: 'Enter a Deepgram API key to enable real-time transcription.',
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          input: 'password',
          required: true,
          description: 'Your Deepgram API key.'
        }
      ]
    }
  ],
  create: (config) => new DeepgramASRProvider(config)
}

export { DeepgramASRProvider, type DeepgramConfig } from './provider.ts'
