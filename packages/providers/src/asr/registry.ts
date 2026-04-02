import { ProviderError } from '../shared/errors.ts'
import type {
  ASRProvider,
  ASRCapabilities,
  ASRProviderDescriptor,
  CloudASRProvider,
  LocalASRProvider,
  StreamingASRProvider,
} from './contracts.ts'
import { resolveASRCapabilities } from './contracts.ts'

export type AnyASRProvider = ASRProvider | CloudASRProvider | LocalASRProvider | StreamingASRProvider

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

  register(descriptor: ASRProviderDescriptor): void {
    if (this.descriptors.has(descriptor.id)) {
      throw new ProviderError(descriptor.id, `Provider "${descriptor.id}" is already registered`)
    }

    this.descriptors.set(descriptor.id, descriptor)
    this.hooks.onRegistered?.(descriptor.id, descriptor)
  }

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

  get(id: string): AnyASRProvider | undefined {
    return this.instances.get(id)
  }

  listDescriptors(): ASRProviderDescriptor[] {
    return Array.from(this.descriptors.values())
  }

  listCloudDescriptors(): ASRProviderDescriptor[] {
    return this.listDescriptors().filter((descriptor) => descriptor.kind === 'cloud')
  }

  listLocalDescriptors(): ASRProviderDescriptor[] {
    return this.listDescriptors().filter((descriptor) => descriptor.kind === 'local')
  }

  isLocal(provider: AnyASRProvider): provider is LocalASRProvider {
    return 'listModels' in provider
  }

  getCapabilities(providerOrId: AnyASRProvider | string): ASRCapabilities {
    const id = typeof providerOrId === 'string' ? providerOrId : providerOrId.id
    const descriptor = this.descriptors.get(id)
    return resolveASRCapabilities(descriptor?.capabilities)
  }

  isStreaming(provider: AnyASRProvider): provider is StreamingASRProvider {
    return (
      this.getCapabilities(provider).streaming &&
      typeof (provider as Partial<StreamingASRProvider>).transcribe === 'function'
    )
  }

  async disposeAll(): Promise<void> {
    for (const provider of Array.from(this.instances.values())) {
      await provider.dispose?.()
    }

    this.instances.clear()
  }
}
