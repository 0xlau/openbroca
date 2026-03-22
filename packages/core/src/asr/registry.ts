import { ProviderError } from '../errors.ts'
import type {
  ASRProviderDescriptor,
  CloudASRProvider,
  LocalASRProvider,
} from './types.ts'

export type AnyASRProvider = CloudASRProvider | LocalASRProvider

export interface ASRRegistryHooks {
  onRegistered?: (id: string, descriptor: ASRProviderDescriptor) => void
  onResolved?: (id: string, provider: AnyASRProvider) => void
}

export class ASRProviderRegistry {
  private readonly descriptors = new Map<string, ASRProviderDescriptor>()
  private readonly instances = new Map<string, AnyASRProvider>()
  private readonly hooks: ASRRegistryHooks

  constructor(hooks?: ASRRegistryHooks) {
    this.hooks = hooks ?? {}
  }

  /**
   * Register a provider descriptor.
   * Call this once at app bootstrap per provider.
   */
  register(descriptor: ASRProviderDescriptor): void {
    if (this.descriptors.has(descriptor.id)) {
      throw new ProviderError(descriptor.id, `Provider "${descriptor.id}" is already registered`)
    }
    this.descriptors.set(descriptor.id, descriptor)
    this.hooks.onRegistered?.(descriptor.id, descriptor)
  }

  /**
   * Validate config, instantiate the provider, and cache it.
   * Subsequent calls with the same id return the cached instance.
   */
  resolve(id: string, config: unknown): AnyASRProvider {
    const existing = this.instances.get(id)
    if (existing) return existing

    const descriptor = this.descriptors.get(id)
    if (!descriptor) {
      throw new ProviderError(id, `Provider "${id}" is not registered`)
    }

    const validated = descriptor.configSchema.parse(config)
    const provider = descriptor.create(validated)

    this.instances.set(id, provider)
    this.hooks.onResolved?.(id, provider)
    return provider
  }

  /** Get an already-resolved provider instance, or undefined if not yet resolved. */
  get(id: string): AnyASRProvider | undefined {
    return this.instances.get(id)
  }

  /** List all registered descriptors. */
  listDescriptors(): ASRProviderDescriptor[] {
    return Array.from(this.descriptors.values())
  }

  /** List only cloud ASR descriptors. */
  listCloudDescriptors(): ASRProviderDescriptor[] {
    return this.listDescriptors().filter((d) => d.kind === 'cloud')
  }

  /** List only local ASR descriptors. */
  listLocalDescriptors(): ASRProviderDescriptor[] {
    return this.listDescriptors().filter((d) => d.kind === 'local')
  }

  /** Type guard: check if a resolved provider is a LocalASRProvider. */
  isLocal(provider: AnyASRProvider): provider is LocalASRProvider {
    return 'listModels' in provider
  }

  /** Dispose all resolved providers and clear instances. Does not remove descriptors. */
  async disposeAll(): Promise<void> {
    for (const provider of Array.from(this.instances.values())) {
      await provider.dispose?.()
    }
    this.instances.clear()
  }
}
