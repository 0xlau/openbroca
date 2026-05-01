import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../../shared/errors.ts'
import { ASRProviderRegistry } from '../registry.ts'
import type { ProviderSetupStatus } from '../../shared/settings.ts'
import type {
  ASRProvider,
  ASRProviderDescriptor,
  LocalASRProvider,
  LocalCatalogModel,
  LocalModelInstallEvent,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent,
} from '../contracts.ts'

interface FakeCloudConfig { apiKey: string }
interface FakeLocalConfig { modelDir: string }

const cloudSchema = {
  parse: (data: unknown): FakeCloudConfig => {
    const d = data as Record<string, unknown>
    if (!d.apiKey) throw new Error('apiKey required')
    return { apiKey: d.apiKey as string }
  },
}

const localSchema = {
  parse: (data: unknown): FakeLocalConfig => {
    const d = data as Record<string, unknown>
    if (!d.modelDir) throw new Error('modelDir required')
    return { modelDir: d.modelDir as string }
  },
}

function makeCloudProvider(): ASRProvider {
  return {
    id: 'cloud',
    displayName: 'Cloud ASR',
    isConfigured: () => true,
    async recognize(): Promise<RecognitionResult> {
      return { text: 'hello', segments: [{ text: 'hello', isFinal: true }] }
    },
  }
}

function makeLocalProvider(): LocalASRProvider {
  return {
    id: 'local',
    displayName: 'Local ASR',
    isConfigured: () => true,
    async recognize(): Promise<RecognitionResult> {
      return { text: 'world', segments: [{ text: 'world', isFinal: true }] }
    },
    listCatalogModels: async () => [],
    scanInstalledModels: async () => [],
    async *installModel(): AsyncIterable<LocalModelInstallEvent> {
      // empty
    },
    removeInstalledModel: async () => undefined,
    resolveModelRuntime: async (id) => ({ modelId: id, modelPath: '/tmp/local' })
  }
}

function makeStreamingProvider(): StreamingASRProvider {
  return {
    id: 'streaming',
    displayName: 'Streaming ASR',
    isConfigured: () => true,
    async recognize(): Promise<RecognitionResult> {
      return { text: 'hello world', segments: [{ text: 'hello', isFinal: true }] }
    },
    async *transcribe(): AsyncIterable<TranscriptionEvent> {
      yield { type: 'final', segment: { text: 'hello', isFinal: true } }
    },
  }
}

function makeCloudDescriptor(id = 'cloud'): ASRProviderDescriptor<FakeCloudConfig> {
  return {
    id,
    displayName: 'Cloud',
    description: '',
    kind: 'cloud',
    configSchema: cloudSchema,
    create: makeCloudProvider,
  }
}

function makeLocalDescriptor(id = 'local'): ASRProviderDescriptor<FakeLocalConfig> {
  return {
    id,
    displayName: 'Local',
    description: '',
    kind: 'local',
    configSchema: localSchema,
    create: makeLocalProvider,
  }
}

describe('ASRProviderRegistry', () => {
  describe('register', () => {
    it('stores a descriptor', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor())
      expect(registry.listDescriptors()).toHaveLength(1)
    })

    it('rejects duplicate registration', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor('x'))
      expect(() => registry.register(makeCloudDescriptor('x'))).toThrow(ProviderError)
    })

    it('calls onRegistered hook', () => {
      const onRegistered = vi.fn()
      const registry = new ASRProviderRegistry({ onRegistered })
      registry.register(makeCloudDescriptor('x'))
      expect(onRegistered).toHaveBeenCalledWith('x', expect.objectContaining({ id: 'x' }))
    })

    it('registers a local ASR descriptor whose provider exposes the no-arg lifecycle', async () => {
      const registry = new ASRProviderRegistry()

      const catalog: LocalCatalogModel[] = [
        {
          id: 'm1',
          name: 'Model 1',
          sizeBytes: 1024,
          downloadUrl: 'https://example.com/m1.tar.bz2',
          sha256: 'aa',
          recommendedFor: ['en']
        }
      ]

      const localSchema = {
        parse: (data: unknown): { modelDir: string } => {
          const d = (data ?? {}) as { modelDir?: string }
          return { modelDir: d.modelDir ?? '/tmp' }
        }
      }
      const localSettingsSchema = {
        parse: (data: unknown): { selectedModelId?: string } => {
          const d = (data ?? {}) as { selectedModelId?: string }
          return { selectedModelId: d.selectedModelId }
        }
      }

      const descriptor: ASRProviderDescriptor<{ modelDir: string }, { selectedModelId?: string }> = {
        id: 'mock-local-lifecycle',
        displayName: 'Mock Local',
        description: '',
        kind: 'local',
        configSchema: localSchema,
        settingsSchema: localSettingsSchema,
        settingsItems: [
          { key: 'selectedModelId', type: 'local-model-select', label: 'Current model' }
        ],
        create: () => ({
          id: 'mock-local-lifecycle',
          displayName: 'Mock Local',
          isConfigured: () => true,
          recognize: async () => ({ text: '', segments: [] }),
          listCatalogModels: async () => catalog,
          scanInstalledModels: async () => [],
          installModel: async function* (): AsyncIterable<LocalModelInstallEvent> {
            yield { phase: 'downloading', downloadedBytes: 0, totalBytes: 1024 }
            yield { phase: 'extracting' }
            yield { phase: 'validating' }
            yield { phase: 'finalizing' }
          },
          removeInstalledModel: async () => undefined,
          resolveModelRuntime: async (id) => ({ modelId: id, modelPath: '/tmp/mock' })
        })
      }

      registry.register(descriptor)
      const provider = registry.resolve('mock-local-lifecycle', { modelDir: '/tmp' })

      expect(registry.isLocal(provider)).toBe(true)
      if (!registry.isLocal(provider)) throw new Error('expected local provider')

      const installed = await provider.scanInstalledModels()
      expect(installed).toEqual([])

      const seenCatalog = await provider.listCatalogModels()
      expect(seenCatalog[0]).toMatchObject({ id: 'm1', sha256: 'aa', recommendedFor: ['en'] })

      const phases: string[] = []
      for await (const event of provider.installModel('m1')) {
        phases.push(event.phase)
      }
      expect(phases).toEqual(['downloading', 'extracting', 'validating', 'finalizing'])

      await expect(provider.resolveModelRuntime('m1')).resolves.toEqual({
        modelId: 'm1',
        modelPath: '/tmp/mock'
      })
    })

    it('preserves settings metadata on registered asr descriptors', () => {
      const registry = new ASRProviderRegistry()
      const settingsSchema = {
        parse: (data: unknown) => {
          const parsed = data as { language?: string }
          return { language: parsed.language ?? 'en' }
        },
      }
      const getSetupStatus = (): ProviderSetupStatus => ({
        status: 'ready',
        canActivate: true,
        blockingReasons: [],
      })

      registry.register({
        ...makeCloudDescriptor('settings-asr'),
        settingsSchema,
        settingsItems: [
          {
            key: 'language',
            type: 'select',
            label: 'Language',
            description: 'Choose the default language',
            options: [{ label: 'English', value: 'en' }]
          }
        ],
        getSetupStatus
      })

      const [descriptor] = registry.listDescriptors()
      const typedDescriptor = descriptor as ASRProviderDescriptor<FakeCloudConfig, { language?: string }>

      expect(descriptor).toMatchObject({
        id: 'settings-asr',
        settingsItems: [
          expect.objectContaining({
            key: 'language',
            type: 'select'
          })
        ]
      })

      const parsed = typedDescriptor.settingsSchema?.parse({ language: 'es' })
      expect(parsed?.language).toBe('es')

      const status = typedDescriptor.getSetupStatus?.({ connection: undefined, settings: {} })
      expect(status).toEqual({
        status: 'ready',
        canActivate: true,
        blockingReasons: [],
      })
    })
  })

  describe('resolve', () => {
    it('validates config and caches instance', () => {
      const create = vi.fn(makeCloudProvider)
      const registry = new ASRProviderRegistry()
      registry.register({ ...makeCloudDescriptor(), create })

      registry.resolve('cloud', { apiKey: 'k' })
      registry.resolve('cloud', { apiKey: 'k' })
      expect(create).toHaveBeenCalledOnce()
    })

    it('throws for unknown id', () => {
      const registry = new ASRProviderRegistry()
      expect(() => registry.resolve('nope', {})).toThrow(ProviderError)
    })

    it('validates config via schema', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor())
      expect(() => registry.resolve('cloud', {})).toThrow('apiKey required')
    })

    it('rebuilds when config changes and disposes the previous instance', () => {
      const dispose = vi.fn()
      const create = vi.fn(() => ({ ...makeCloudProvider(), dispose }))
      const registry = new ASRProviderRegistry()
      registry.register({ ...makeCloudDescriptor(), create })

      const first = registry.resolve('cloud', { apiKey: 'one' })
      const second = registry.resolve('cloud', { apiKey: 'two' })

      expect(first).not.toBe(second)
      expect(create).toHaveBeenCalledTimes(2)
      expect(dispose).toHaveBeenCalledOnce()
    })
  })

  describe('get', () => {
    it('returns undefined before resolve', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor())
      expect(registry.get('cloud')).toBeUndefined()
    })

    it('returns instance after resolve', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor())
      const provider = registry.resolve('cloud', { apiKey: 'k' })
      expect(registry.get('cloud')).toBe(provider)
    })
  })

  describe('listCloudDescriptors / listLocalDescriptors', () => {
    it('filters by kind', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor('c'))
      registry.register(makeLocalDescriptor('l'))

      expect(registry.listCloudDescriptors()).toHaveLength(1)
      expect(registry.listCloudDescriptors()[0]?.id).toBe('c')
      expect(registry.listLocalDescriptors()).toHaveLength(1)
      expect(registry.listLocalDescriptors()[0]?.id).toBe('l')
    })
  })

  describe('isLocal', () => {
    it('returns true for LocalASRProvider', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeLocalDescriptor())
      const provider = registry.resolve('local', { modelDir: '/tmp' })
      expect(registry.isLocal(provider)).toBe(true)
    })

    it('returns false for cloud ASRProvider', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor())
      const provider = registry.resolve('cloud', { apiKey: 'k' })
      expect(registry.isLocal(provider)).toBe(false)
    })
  })

  describe('getCapabilities', () => {
    it('returns defaults for descriptors without overrides', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor('cap-default'))
      const provider = registry.resolve('cap-default', { apiKey: 'k' })

      expect(registry.getCapabilities(provider)).toEqual({
        nonStreaming: true,
        streaming: false,
      })
    })

    it('merges descriptor overrides', () => {
      const registry = new ASRProviderRegistry()
      registry.register({
        ...makeCloudDescriptor('cap-streaming'),
        capabilities: { streaming: true },
      })

      expect(registry.getCapabilities('cap-streaming')).toEqual({
        nonStreaming: true,
        streaming: true,
      })
    })
  })

  describe('isStreaming', () => {
    it('returns false when capability is not enabled even if provider has transcribe', () => {
      const registry = new ASRProviderRegistry()
      registry.register({
        ...makeCloudDescriptor('legacy-stream'),
        create: makeStreamingProvider,
        capabilities: { streaming: false },
      })
      const provider = registry.resolve('legacy-stream', { apiKey: 'k' })
      expect(registry.isStreaming(provider)).toBe(false)
    })

    it('returns false when capability is enabled but provider has no transcribe function', () => {
      const registry = new ASRProviderRegistry()
      registry.register({
        ...makeCloudDescriptor('descriptor-only-stream'),
        capabilities: { streaming: true },
        create: makeCloudProvider,
      })

      const provider = registry.resolve('descriptor-only-stream', { apiKey: 'k' })
      expect(registry.isStreaming(provider)).toBe(false)
    })

    it('returns true only when streaming capability is enabled', () => {
      const registry = new ASRProviderRegistry()
      registry.register({
        ...makeCloudDescriptor('streaming'),
        create: makeStreamingProvider,
        capabilities: { streaming: true },
      })
      const provider = registry.resolve('streaming', { apiKey: 'k' })
      expect(registry.isStreaming(provider)).toBe(true)
    })
  })

  describe('disposeAll', () => {
    it('calls dispose and clears instances', async () => {
      const dispose = vi.fn().mockResolvedValue(undefined)
      const provider: ASRProvider = { ...makeCloudProvider(), dispose }
      const registry = new ASRProviderRegistry()
      registry.register({ ...makeCloudDescriptor(), create: () => provider })
      registry.resolve('cloud', { apiKey: 'k' })

      await registry.disposeAll()
      expect(dispose).toHaveBeenCalledOnce()
      expect(registry.get('cloud')).toBeUndefined()
    })
  })
})
