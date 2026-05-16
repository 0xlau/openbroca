import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import type { ProviderSetupStatus } from '../../../shared/settings.ts'
import {
  OpenAICompatibleLLMProvider,
  type OpenAICompatibleConfig,
  type OpenAICompatibleModelListStrategy,
  type OpenAICompatibleStaticModel
} from './provider.ts'

export interface OpenAICompatibleDescriptorDefinition {
  id: string
  displayName: string
  description: string
  icon?: string
  defaultBaseUrl: string
  defaultModelListStrategy?: OpenAICompatibleModelListStrategy
  staticModels?: OpenAICompatibleStaticModel[]
  requiresApiKey?: boolean
  apiKeyLabel?: string
  apiKeyDescription?: string
  modelDescription?: string
}

const modelListStrategySchema = z
  .enum(['api', 'static', 'none'])
  .optional()
  .default('api')

const settingsSchema = z.object({
  model: z.string().trim().min(1, 'Choose a model')
})

export type OpenAICompatibleSettings = z.infer<typeof settingsSchema>

function setupStatusForModel(settings: Record<string, unknown> | undefined): ProviderSetupStatus {
  const model = typeof settings?.model === 'string' ? settings.model.trim() : ''

  if (!model) {
    return {
      status: 'configured',
      canActivate: false,
      summary: 'Select a model to finish setup.',
      blockingReasons: ['Choose a model'],
      fieldErrors: { model: 'Choose a model' }
    }
  }

  return {
    status: 'ready',
    canActivate: true,
    summary: 'Ready to use.',
    blockingReasons: []
  }
}

export function createOpenAICompatibleDescriptor(
  definition: OpenAICompatibleDescriptorDefinition
): LLMProviderDescriptor<OpenAICompatibleConfig, OpenAICompatibleSettings> {
  const requiresApiKey = definition.requiresApiKey ?? true
  const configSchema = z.object({
    apiKey: requiresApiKey
      ? z.string().trim().min(1, 'API key is required')
      : z.string().optional().default(''),
    baseUrl: z.string().url().optional().default(definition.defaultBaseUrl),
    modelListStrategy: modelListStrategySchema.default(
      definition.defaultModelListStrategy ?? 'api'
    )
  }).transform((config) => ({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    modelListStrategy: config.modelListStrategy
  }))

  return {
    id: definition.id,
    displayName: definition.displayName,
    description: definition.description,
    icon: definition.icon,
    configSchema,
    settingsSchema,
    settingsItems: [
      {
        key: 'model',
        type: 'model-select',
        label: 'Model',
        description: definition.modelDescription ??
          `Choose the default ${definition.displayName} model, or enter a custom model ID.`,
        required: true,
        dataSource: 'llm-models',
        allowCustomValue: true
      }
    ],
    getSetupStatus: ({ settings }) => setupStatusForModel(settings),
    capabilities: {
      streaming: true,
      nonStreaming: true,
      functionCalling: true,
      vision: true,
      jsonMode: true
    },
    connectionOptions: [
      {
        type: 'apiKey',
        label: definition.apiKeyLabel ?? 'API Key',
        description: definition.apiKeyDescription ??
          `Provide a ${definition.displayName} API key and endpoint.`,
        fields: [
          {
            key: 'apiKey',
            label: 'API Key',
            input: 'password',
            required: requiresApiKey,
            description: requiresApiKey
              ? `Your ${definition.displayName} API key.`
              : `Optional. ${definition.displayName} may ignore this value for local endpoints.`
          },
          {
            key: 'baseUrl',
            label: 'Base URL',
            input: 'url',
            placeholder: definition.defaultBaseUrl,
            description: 'OpenAI-compatible API base URL.',
            advanced: true
          },
          {
            key: 'modelListStrategy',
            label: 'Model List Strategy',
            input: 'text',
            placeholder: definition.defaultModelListStrategy ?? 'api',
            description: 'Use api, static, or none. api calls /models; static uses bundled suggestions; none disables model fetching.',
            advanced: true
          }
        ]
      }
    ],
    create: (config) => new OpenAICompatibleLLMProvider({
      id: definition.id,
      displayName: definition.displayName,
      config: {
        ...config,
        baseUrl: config.baseUrl || definition.defaultBaseUrl,
        modelListStrategy: config.modelListStrategy ?? definition.defaultModelListStrategy ?? 'api'
      },
      staticModels: definition.staticModels,
      requiresApiKey
    })
  }
}
