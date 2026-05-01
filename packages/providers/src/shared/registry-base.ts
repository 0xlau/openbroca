import { ProviderError } from './errors.ts'
import { stableCacheKey } from './cache-key.ts'
import type { ConfigSchema, Disposable } from './types.ts'

export interface BaseDescriptor<TConfig = unknown> {
  id: string
  configSchema: ConfigSchema<TConfig>
  create(config: TConfig): BaseProvider
}

export interface BaseProvider extends Partial<Disposable> {
  readonly id: string
}

export interface RegistryHooks<TDescriptor, TProvider> {
  onRegistered?: (id: string, descriptor: TDescriptor) => void
  onResolved?: (id: string, provider: TProvider) => void
}

interface CachedInstance<TProvider> {
  provider: TProvider
  cacheKey: string
}

/**
 * Shared registry behavior for descriptor-based provider registration.
 *
 * Subclasses get config-aware caching, lifecycle management, and lookup for free.
 * Override `transform` to wrap the raw provider (e.g. with middleware).
 */
export abstract class ProviderRegistry<
  TDescriptor extends BaseDescriptor,
  TProvider extends BaseProvider,
> {
  protected readonly descriptors = new Map<string, TDescriptor>()
  protected readonly instances = new Map<string, CachedInstance<TProvider>>()
  protected readonly hooks: RegistryHooks<TDescriptor, TProvider>

  constructor(hooks?: RegistryHooks<TDescriptor, TProvider>) {
    this.hooks = hooks ?? {}
  }

  register(descriptor: TDescriptor): void {
    if (this.descriptors.has(descriptor.id)) {
      throw new ProviderError(descriptor.id, `Provider "${descriptor.id}" is already registered`)
    }

    this.descriptors.set(descriptor.id, descriptor)
    this.hooks.onRegistered?.(descriptor.id, descriptor)
  }

  resolve(id: string, config: unknown): TProvider {
    const descriptor = this.descriptors.get(id)
    if (!descriptor) {
      throw new ProviderError(id, `Provider "${id}" is not registered`)
    }

    const validated = descriptor.configSchema.parse(config)
    const cacheKey = stableCacheKey(validated)
    const cached = this.instances.get(id)
    if (cached && cached.cacheKey === cacheKey) {
      return cached.provider
    }

    if (cached) {
      // Config changed — release the old instance. Fire-and-forget so resolve stays sync.
      void cached.provider.dispose?.()
    }

    const raw = descriptor.create(validated) as TProvider
    const provider = this.transform(raw, descriptor)

    this.instances.set(id, { provider, cacheKey })
    this.hooks.onResolved?.(id, provider)
    return provider
  }

  get(id: string): TProvider | undefined {
    return this.instances.get(id)?.provider
  }

  async evict(id: string): Promise<void> {
    const cached = this.instances.get(id)
    if (!cached) {
      return
    }

    await cached.provider.dispose?.()
    this.instances.delete(id)
  }

  listDescriptors(): TDescriptor[] {
    return Array.from(this.descriptors.values())
  }

  async disposeAll(): Promise<void> {
    for (const cached of Array.from(this.instances.values())) {
      await cached.provider.dispose?.()
    }

    this.instances.clear()
  }

  /**
   * Hook for subclasses to wrap the raw provider before it's cached.
   * Default: identity. Override to add middleware, decorators, etc.
   */
  protected transform(provider: TProvider, _descriptor: TDescriptor): TProvider {
    return provider
  }
}
