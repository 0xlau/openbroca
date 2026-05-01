import { z } from 'zod'
import type { ASRProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import {
  SherpaOnnxASRProvider,
  type SherpaModelManifestEntry,
  type SherpaOnnxConfig
} from './provider.ts'

interface SherpaOnnxSettings {
  selectedModelId?: string
}

export interface CreateSherpaOnnxDescriptorOptions {
  /**
   * Where downloaded models are stored. Typically
   * `path.join(app.getPath('userData'), 'asr-models', 'sherpa-onnx')`.
   * Surfaced as the `modelDir` config default; users can override under
   * Advanced settings.
   */
  defaultModelDir: string
}

export function createSherpaOnnxDescriptor(
  opts: CreateSherpaOnnxDescriptorOptions
): ASRProviderDescriptor<SherpaOnnxConfig, SherpaOnnxSettings> {
  // Models are typed at compile time via SherpaModelManifestEntry. We only
  // re-cast through the schema; runtime validation of bundled model objects
  // would have to round-trip the buildRecognizerConfig function and Zod
  // doesn't preserve functions through .parse().
  const configSchema = {
    parse(data: unknown): SherpaOnnxConfig {
      const parsed = z
        .object({
          modelDir: z.string().min(1).default(opts.defaultModelDir),
          models: z.unknown().optional()
        })
        .parse(data ?? {})
      return {
        modelDir: parsed.modelDir,
        models: parsed.models as SherpaModelManifestEntry[] | undefined
      }
    }
  }

  const settingsSchema = z.object({
    selectedModelId: z.string().trim().min(1).optional()
  })

  return {
    id: 'sherpa-onnx',
    displayName: '@k2-fsa/sherpa-onnx',
    description:
      'On-device speech recognition powered by sherpa-onnx — no internet required.',
    icon: providerIcons['sherpa-onnx'],
    kind: 'local',
    capabilities: { streaming: true },
    configSchema,
    settingsSchema,
    settingsItems: [
      {
        key: 'selectedModelId',
        type: 'local-model-select',
        label: 'Current model',
        description:
          'Switch to another installed model or download one from the catalog.'
      }
    ],
    connectionOptions: [
      {
        type: 'local',
        label: 'Local model',
        description: `Models are stored under ${opts.defaultModelDir} by default.`,
        fields: [
          {
            key: 'modelDir',
            label: 'Model directory',
            input: 'directory',
            required: false,
            placeholder: opts.defaultModelDir,
            description: 'Advanced: override where downloaded models are stored.'
          }
        ]
      }
    ],
    getSetupStatus: ({ settings }) => {
      const id =
        typeof (settings as SherpaOnnxSettings | undefined)?.selectedModelId === 'string'
          ? (settings as SherpaOnnxSettings).selectedModelId?.trim()
          : ''
      if (!id) {
        return {
          status: 'configured',
          canActivate: false,
          summary: 'Choose or download a model to finish setup.',
          blockingReasons: ['Select a model']
        }
      }
      return {
        status: 'ready',
        canActivate: true,
        summary: `Active: ${id}`,
        blockingReasons: []
      }
    },
    create: (config) => new SherpaOnnxASRProvider(config)
  }
}

export {
  DEFAULT_SHERPA_MODELS,
  SherpaOnnxASRProvider,
  type SherpaModelManifestEntry,
  type SherpaOnnxConfig
} from './provider.ts'
