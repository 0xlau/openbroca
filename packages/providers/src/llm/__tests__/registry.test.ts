import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../../shared/errors.ts'
import { LLMProviderRegistry } from '../registry.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  LLMModel,
  LLMProvider,
  LLMProviderDescriptor,
} from '../contracts.ts'

interface FakeConfig { apiKey: string }

const fakeSchema = {
  parse: (data: unknown): FakeConfig => {
    const d = data as Record<string, unknown>
    if (!d.apiKey) throw new Error('apiKey required')
    return { apiKey: d.apiKey as string }
  },
}

function makeFakeProvider(id = 'fake'): LLMProvider {
  return {
    id,
    displayName: 'Fake',
    isConfigured: () => true,
    listModels: async (): Promise<LLMModel[]> => [{ id: 'model-1', name: 'Model 1' }],
    async *complete(_req: CompletionRequest): AsyncIterable<CompletionChunk> {
      yield { delta: 'hello' }
    },
  }
}

function makeDescriptor(
  id = 'fake',
  overrides: Partial<LLMProviderDescriptor<FakeConfig>> = {}
): LLMProviderDescriptor<FakeConfig> {
  return {
    id,
    displayName: 'Fake Provider',
    description: 'A fake provider for tests',
    configSchema: fakeSchema,
    create: () => makeFakeProvider(id),
    ...overrides,
  }
}

describe('LLMProviderRegistry', () => {
  describe('register', () => {
    it('stores a descriptor', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor())
      expect(registry.listDescriptors()).toHaveLength(1)
    })

    it('rejects duplicate registration', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('x'))
      expect(() => registry.register(makeDescriptor('x'))).toThrow(ProviderError)
    })

    it('allows different ids', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('a'))
      registry.register(makeDescriptor('b'))
      expect(registry.listDescriptors()).toHaveLength(2)
    })

    it('calls onRegistered hook', () => {
      const onRegistered = vi.fn()
      const registry = new LLMProviderRegistry({ onRegistered })
      registry.register(makeDescriptor('x'))
      expect(onRegistered).toHaveBeenCalledWith('x', expect.objectContaining({ id: 'x' }))
    })
  })

  describe('resolve', () => {
    it('validates config via schema', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor())
      expect(() => registry.resolve('fake', {})).toThrow('apiKey required')
    })

    it('creates and caches an instance', () => {
      const create = vi.fn(() => makeFakeProvider())
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('fake', { create }))

      const p1 = registry.resolve('fake', { apiKey: 'key' })
      const p2 = registry.resolve('fake', { apiKey: 'key' })

      expect(create).toHaveBeenCalledOnce()
      expect(p1).toBe(p2)
    })

    it('throws ProviderError for unknown id', () => {
      const registry = new LLMProviderRegistry()
      expect(() => registry.resolve('unknown', {})).toThrow(ProviderError)
    })

    it('calls onResolved hook', () => {
      const onResolved = vi.fn()
      const registry = new LLMProviderRegistry({ onResolved })
      registry.register(makeDescriptor())
      registry.resolve('fake', { apiKey: 'k' })
      expect(onResolved).toHaveBeenCalledWith('fake', expect.any(Object))
    })
  })

  describe('get', () => {
    it('returns undefined before resolve', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor())
      expect(registry.get('fake')).toBeUndefined()
    })

    it('returns instance after resolve', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor())
      const resolved = registry.resolve('fake', { apiKey: 'k' })
      expect(registry.get('fake')).toBe(resolved)
    })
  })

  describe('listDescriptors', () => {
    it('returns descriptors without resolving providers', () => {
      const create = vi.fn(() => makeFakeProvider())
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('fake', { create }))
      registry.listDescriptors()
      expect(create).not.toHaveBeenCalled()
    })
  })

  describe('getCapabilities', () => {
    it('fills defaults for unspecified capabilities', () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('fake', { capabilities: { streaming: true } }))
      const caps = registry.getCapabilities('fake')
      expect(caps.streaming).toBe(true)
      expect(caps.functionCalling).toBe(false)
      expect(caps.vision).toBe(false)
      expect(caps.jsonMode).toBe(false)
    })

    it('throws for unknown id', () => {
      const registry = new LLMProviderRegistry()
      expect(() => registry.getCapabilities('nope')).toThrow(ProviderError)
    })
  })

  describe('use (middleware)', () => {
    it('middleware wraps the resolved provider complete()', async () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor())

      const seen: string[] = []
      registry.use((next) =>
        async function* (req) {
          seen.push('enter')
          for await (const chunk of next(req)) {
            yield { ...chunk, delta: chunk.delta + '!' }
          }
          seen.push('exit')
        }
      )

      const provider = registry.resolve('fake', { apiKey: 'k' })
      const chunks: CompletionChunk[] = []
      for await (const c of provider.complete({ model: 'm', messages: [] })) {
        chunks.push(c)
      }

      expect(chunks[0]?.delta).toBe('hello!')
      expect(seen).toEqual(['enter', 'exit'])
    })

    it('original provider is not mutated by middleware wrapping', () => {
      const original = makeFakeProvider()
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('fake', { create: () => original }))
      registry.use((next) => async function* (req) { yield* next(req) })

      const wrapped = registry.resolve('fake', { apiKey: 'k' })
      expect(wrapped).not.toBe(original)
      expect(original.complete).toBe(original.complete)
    })
  })

  describe('disposeAll', () => {
    it('calls dispose on all resolved providers', async () => {
      const dispose = vi.fn().mockResolvedValue(undefined)
      const providerWithDispose: LLMProvider = { ...makeFakeProvider(), dispose }

      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor('fake', { create: () => providerWithDispose }))
      registry.resolve('fake', { apiKey: 'k' })

      await registry.disposeAll()
      expect(dispose).toHaveBeenCalledOnce()
    })

    it('clears instances after dispose', async () => {
      const registry = new LLMProviderRegistry()
      registry.register(makeDescriptor())
      registry.resolve('fake', { apiKey: 'k' })

      await registry.disposeAll()
      expect(registry.get('fake')).toBeUndefined()
    })
  })
})
