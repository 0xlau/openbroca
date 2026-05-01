import { ProviderRegistry, type RegistryHooks } from '../shared/registry-base.ts'
import type {
  ASRProvider,
  ASRCapabilities,
  ASRProviderDescriptor,
  LocalASRProvider,
  StreamingASRProvider,
} from './contracts.ts'
import { resolveASRCapabilities } from './contracts.ts'

export type AnyASRProvider = ASRProvider | LocalASRProvider | StreamingASRProvider

export type ASRRegistryHooks = RegistryHooks<ASRProviderDescriptor, AnyASRProvider>

export class ASRProviderRegistry extends ProviderRegistry<ASRProviderDescriptor, AnyASRProvider> {
  listCloudDescriptors(): ASRProviderDescriptor[] {
    return this.listDescriptors().filter((descriptor) => descriptor.kind === 'cloud')
  }

  listLocalDescriptors(): ASRProviderDescriptor[] {
    return this.listDescriptors().filter((descriptor) => descriptor.kind === 'local')
  }

  isLocal(provider: AnyASRProvider): provider is LocalASRProvider {
    return this.descriptors.get(provider.id)?.kind === 'local'
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
}
