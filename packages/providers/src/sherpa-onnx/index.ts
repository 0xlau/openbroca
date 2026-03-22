import { z } from 'zod'
import type { ASRProviderDescriptor } from '@openbroca/core/asr'
import { SherpaOnnxASRProvider, type SherpaOnnxConfig } from './provider'

const configSchema = z.object({
  modelDir: z.string().min(1, 'Model directory path is required'),
})

export const sherpaOnnxDescriptor: ASRProviderDescriptor<SherpaOnnxConfig> = {
  id: 'sherpa-onnx',
  displayName: 'Sherpa-ONNX',
  description: 'On-device speech recognition powered by sherpa-onnx — no internet required',
  kind: 'local',
  configSchema,
  create: (config) => new SherpaOnnxASRProvider(config),
}

export { SherpaOnnxASRProvider, type SherpaOnnxConfig } from './provider'
