import { ProviderError } from '../shared/errors.ts'
import type {
  ASRProviderDescriptor,
  CloudASRProvider,
  LocalASRProvider,
} from './contracts.ts'

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

  async disposeAll(): Promise<void> {
    for (const provider of Array.from(this.instances.values())) {
      await provider.dispose?.()
    }

    this.instances.clear()
  }
}
