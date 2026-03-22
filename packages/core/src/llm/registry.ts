import { ProviderError } from '../errors'
import {
  composeMiddleware,
  type LLMCapabilities,
  type LLMMiddleware,
  type LLMProvider,
  type LLMProviderDescriptor,
} from './types'

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

  /**
   * Register a provider descriptor.
   * Call this once at app bootstrap per provider.
   */
  register(descriptor: LLMProviderDescriptor): void {
    if (this.descriptors.has(descriptor.id)) {
      throw new ProviderError(descriptor.id, `Provider "${descriptor.id}" is already registered`)
    }
    this.descriptors.set(descriptor.id, descriptor)
    this.hooks.onRegistered?.(descriptor.id, descriptor)
  }

  /**
   * Add a global middleware that wraps every provider's complete() call.
   * Middleware added earlier wraps outer; middleware added later wraps inner.
   */
  use(middleware: LLMMiddleware): void {
    this.middlewares.push(middleware)
  }

  /**
   * Validate config, instantiate the provider, and apply middleware.
   * Subsequent calls with the same id return the cached instance.
   */
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

  /** Get an already-resolved provider instance, or undefined if not yet resolved. */
  get(id: string): LLMProvider | undefined {
    return this.instances.get(id)
  }

  /** List all registered descriptors. Safe to call before any provider is resolved. */
  listDescriptors(): LLMProviderDescriptor[] {
    return Array.from(this.descriptors.values())
  }

  /** Get the resolved capabilities for a descriptor (fills in defaults). */
  getCapabilities(id: string): LLMCapabilities {
    const descriptor = this.descriptors.get(id)
    if (!descriptor) {
      throw new ProviderError(id, `Provider "${id}" is not registered`)
    }
    return { ...DEFAULT_CAPABILITIES, ...descriptor.capabilities }
  }

  /** Dispose all resolved providers and clear instances. Does not remove descriptors. */
  async disposeAll(): Promise<void> {
    for (const provider of Array.from(this.instances.values())) {
      await provider.dispose?.()
    }
    this.instances.clear()
  }

  private wrapWithMiddleware(provider: LLMProvider): LLMProvider {
    const wrappedComplete = composeMiddleware(this.middlewares, (req) => provider.complete(req))
    return new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === 'complete') return wrappedComplete
        return Reflect.get(target, prop, receiver)
      },
    })
  }
}
