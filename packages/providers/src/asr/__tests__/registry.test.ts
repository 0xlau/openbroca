import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../../shared/errors.ts'
import { ASRProviderRegistry } from '../registry.ts'
import type {
  ASRProviderDescriptor,
  CloudASRProvider,
  LocalASRProvider,
  TranscriptionSegment,
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

function makeCloudProvider(): CloudASRProvider {
  return {
    id: 'cloud',
    displayName: 'Cloud ASR',
    isConfigured: () => true,
    async *transcribe(): AsyncIterable<TranscriptionSegment> {
      yield { text: 'hello', isFinal: true }
    },
  }
}

function makeLocalProvider(): LocalASRProvider {
  return {
    id: 'local',
    displayName: 'Local ASR',
    isConfigured: () => true,
    async *transcribe(): AsyncIterable<TranscriptionSegment> {
      yield { text: 'world', isFinal: true }
    },
    listModels: async () => [],
    async *downloadModel() {
      // empty
    },
    deleteModel: async () => {},
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

    it('returns false for CloudASRProvider', () => {
      const registry = new ASRProviderRegistry()
      registry.register(makeCloudDescriptor())
      const provider = registry.resolve('cloud', { apiKey: 'k' })
      expect(registry.isLocal(provider)).toBe(false)
    })
  })

  describe('disposeAll', () => {
    it('calls dispose and clears instances', async () => {
      const dispose = vi.fn().mockResolvedValue(undefined)
      const provider: CloudASRProvider = { ...makeCloudProvider(), dispose }
      const registry = new ASRProviderRegistry()
      registry.register({ ...makeCloudDescriptor(), create: () => provider })
      registry.resolve('cloud', { apiKey: 'k' })

      await registry.disposeAll()
      expect(dispose).toHaveBeenCalledOnce()
      expect(registry.get('cloud')).toBeUndefined()
    })
  })
})
