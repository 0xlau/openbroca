import { z } from 'zod'
import type { ASRProviderDescriptor } from '@openbroca/core/asr'
import { DeepgramASRProvider, type DeepgramConfig } from './provider'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
})

export const deepgramDescriptor: ASRProviderDescriptor<DeepgramConfig> = {
  id: 'deepgram',
  displayName: 'Deepgram',
  description: 'Real-time speech recognition via the Deepgram Nova API',
  kind: 'cloud',
  configSchema,
  create: (config) => new DeepgramASRProvider(config),
}

export { DeepgramASRProvider, type DeepgramConfig } from './provider'
