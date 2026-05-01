import { ProviderError } from '../shared/errors.ts'
import { ProviderRegistry, type RegistryHooks } from '../shared/registry-base.ts'
import {
  composeCompleteMiddleware,
  composeGenerateMiddleware,
  type LLMCapabilities,
  type LLMMiddleware,
  type LLMProvider,
  type LLMProviderDescriptor,
} from './contracts.ts'

const DEFAULT_CAPABILITIES: LLMCapabilities = {
  streaming: false,
  nonStreaming: true,
  functionCalling: false,
  vision: false,
  jsonMode: false,
}

export type LLMRegistryHooks = RegistryHooks<LLMProviderDescriptor, LLMProvider>

export class LLMProviderRegistry extends ProviderRegistry<LLMProviderDescriptor, LLMProvider> {
  private readonly middlewares: LLMMiddleware[] = []

  use(middleware: LLMMiddleware): void {
    this.middlewares.push(middleware)
  }

  getCapabilities(id: string): LLMCapabilities {
    const descriptor = this.descriptors.get(id)
    if (!descriptor) {
      throw new ProviderError(id, `Provider "${id}" is not registered`)
    }

    return { ...DEFAULT_CAPABILITIES, ...descriptor.capabilities }
  }

  protected override transform(provider: LLMProvider): LLMProvider {
    if (this.middlewares.length === 0) {
      return provider
    }

    const wrappedComplete = composeCompleteMiddleware(this.middlewares, (request) =>
      provider.complete(request)
    )
    // generate may internally call `this.complete`; bind it to the proxy so those
    // self-calls see the wrapped complete chain too.
    let proxy: LLMProvider
    const wrappedGenerate = composeGenerateMiddleware(this.middlewares, (request) =>
      provider.generate.call(proxy, request)
    )

    proxy = new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === 'complete') return wrappedComplete
        if (prop === 'generate') return wrappedGenerate
        return Reflect.get(target, prop, receiver)
      },
    })
    return proxy
  }
}
