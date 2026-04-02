/// <reference path="../../../shared/assets.d.ts" />
import { z } from 'zod'
import type { ASRProviderDescriptor } from '../../contracts.ts'
import { DeepgramASRProvider, type DeepgramConfig } from './provider.ts'
import icon from './icon.svg?raw'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required')
})

export const deepgramDescriptor: ASRProviderDescriptor<DeepgramConfig> = {
  id: 'deepgram',
  displayName: 'Deepgram',
  description: 'Real-time speech recognition via the Deepgram Nova API',
  icon,
  kind: 'cloud',
  configSchema,
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
