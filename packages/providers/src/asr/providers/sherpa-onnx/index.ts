/// <reference path="../../../shared/assets.d.ts" />
import { z } from 'zod'
import type { ASRProviderDescriptor } from '../../contracts.ts'
import { SherpaOnnxASRProvider, type SherpaOnnxConfig } from './provider.ts'
import icon from './icon.svg?raw'

const configSchema = z.object({
  modelDir: z.string().min(1, 'Model directory path is required')
})

export const sherpaOnnxDescriptor: ASRProviderDescriptor<SherpaOnnxConfig> = {
  id: 'sherpa-onnx',
  displayName: '@k2-fsa/sherpa-onnx',
  description: 'On-device speech recognition powered by sherpa-onnx — no internet required',
  icon,
  kind: 'local',
  capabilities: { streaming: true },
  configSchema,
  connectionOptions: [
    {
      type: 'local',
      label: 'Local Model Path',
      description: 'Point OpenBroca at a sherpa-onnx model directory on this machine.',
      fields: [
        {
          key: 'modelDir',
          label: 'Model Directory',
          input: 'directory',
          required: true,
          description: 'Absolute path to the local sherpa-onnx model directory.'
        }
      ]
    }
  ],
  create: (config) => new SherpaOnnxASRProvider(config)
}

export { SherpaOnnxASRProvider, type SherpaOnnxConfig } from './provider.ts'
