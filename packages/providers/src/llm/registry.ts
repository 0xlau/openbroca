import { ProviderError } from '../shared/errors.ts'
import {
  composeMiddleware,
  type LLMCapabilities,
  type LLMMiddleware,
  type LLMProvider,
  type LLMProviderDescriptor,
} from './contracts.ts'

const DEFAULT_CAPABILITIES: LLMCapabilities = {
  streaming: false,
  functionCalling: false,
  vision: false,
  jsonMode: false,
}

export interface LLMRegistryHooks {
  onRegistered?: (id: string, descriptor: LLMProviderDescriptor) => void
  onResolved?: (id: string, provider: LLMProvider) => void
}

export class LLMProviderRegistry {
  private readonly descriptors = new Map<string, LLMProviderDescriptor>()
  private readonly instances = new Map<string, LLMProvider>()
  private readonly middlewares: LLMMiddleware[] = []
  private readonly hooks: LLMRegistryHooks

  constructor(hooks?: LLMRegistryHooks) {
    this.hooks = hooks ?? {}
  }

  register(descriptor: LLMProviderDescriptor): void {
    if (this.descriptors.has(descriptor.id)) {
      throw new ProviderError(descriptor.id, `Provider "${descriptor.id}" is already registered`)
    }

    this.descriptors.set(descriptor.id, descriptor)
    this.hooks.onRegistered?.(descriptor.id, descriptor)
  }

  use(middleware: LLMMiddleware): void {
    this.middlewares.push(middleware)
  }

  resolve(id: string, config: unknown): LLMProvider {
    const existing = this.instances.get(id)
    if (existing) return existing

    const descriptor = this.descriptors.get(id)
    if (!descriptor) {
      throw new ProviderError(id, `Provider "${id}" is not registered`)
    }

    const validated = descriptor.configSchema.parse(config)
    const provider = descriptor.create(validated)
    const final = this.middlewares.length > 0 ? this.wrapWithMiddleware(provider) : provider

    this.instances.set(id, final)
    this.hooks.onResolved?.(id, final)
    return final
  }

  get(id: string): LLMProvider | undefined {
    return this.instances.get(id)
  }

  listDescriptors(): LLMProviderDescriptor[] {
    return Array.from(this.descriptors.values())
  }

  getCapabilities(id: string): LLMCapabilities {
    const descriptor = this.descriptors.get(id)
    if (!descriptor) {
      throw new ProviderError(id, `Provider "${id}" is not registered`)
    }

    return { ...DEFAULT_CAPABILITIES, ...descriptor.capabilities }
  }

  async disposeAll(): Promise<void> {
    for (const provider of Array.from(this.instances.values())) {
      await provider.dispose?.()
    }

    this.instances.clear()
  }

  private wrapWithMiddleware(provider: LLMProvider): LLMProvider {
    const wrappedComplete = composeMiddleware(this.middlewares, (request) => provider.complete(request))
    return new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === 'complete') return wrappedComplete
        return Reflect.get(target, prop, receiver)
      },
    })
  }
}
