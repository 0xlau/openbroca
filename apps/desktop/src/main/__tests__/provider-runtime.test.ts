import { beforeEach, describe, expect, test, vi } from 'vitest'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { OAuthService } from '../auth/oauth-service'
import type { SecureStorage } from '../auth/secure-storage'
import { llmRegistry as desktopLlmRegistry } from '../providers'
import {
  getActiveASRProviderId,
  getActiveASRSelectedModelId,
  getActiveLLMSelection,
  getActiveLLMModel,
  getActiveLLMProviderId,
  resolveActiveLLMModel,
  resolveActiveLLMProvider,
  resolveActiveASRSelection,
  resolveActiveLLMSelection
} from '../providers/runtime'

const openrouterSdk = vi.hoisted(() => {
  const modelsListForUser = vi.fn()
  const chatSend = vi.fn()

  class OpenRouter {
    models = { listForUser: modelsListForUser }
    chat = { send: chatSend }

    constructor(_opts: unknown) {}
  }

  return {
    OpenRouter,
    modelsListForUser,
    chatSend
  }
})

vi.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: openrouterSdk.OpenRouter
  }
})

const providerHostStub = vi.hoisted(() => {
  const invoke = vi.fn<
    (instanceId: string, method: string, args: unknown[]) => Promise<unknown>
  >(async () => undefined)
  const invokeStream = vi.fn<
    (instanceId: string, method: string, args: unknown[]) => AsyncIterable<unknown>
  >(() => (async function* () {})())
  const createInstance = vi.fn<
    (kind: string, providerId: string, config: unknown) => Promise<string>
  >(async (kind, providerId) => `${kind}:${providerId}:stub-instance`)
  return { invoke, invokeStream, createInstance }
})

vi.mock('../provider-host/host', () => ({
  getProviderHost: () => providerHostStub,
  resetProviderHostSingleton: () => undefined
}))

class MemoryStore {
  private state: Record<string, unknown> = {
    providers: {
      providers: {},
      activeProviders: {}
    }
  }

  get<T>(key: string): T | undefined {
    return this.state[key] as T | undefined
  }

  set(key: string, value: unknown): void {
    this.state[key] = value
  }
}

describe('provider runtime resolution', () => {
  const fetchFn = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchFn.mockReset()
    vi.stubGlobal('fetch', fetchFn)

    openrouterSdk.modelsListForUser.mockReset()
    openrouterSdk.modelsListForUser.mockResolvedValue({
      data: [
        {
          id: 'openai/gpt-4.1-mini',
          name: 'openai/gpt-4.1-mini',
          contextLength: 128_000
        }
      ]
    })
  })

  test('reads active llm/asr provider IDs from structured provider settings', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth'
        },
        deepgram: {
          enabled: true,
          connectionType: 'api-key',
          config: {
            apiKey: 'test'
          }
        }
      },
      activeProviders: {
        llm: 'openai-codex',
        asr: 'deepgram'
      }
    })

    expect(getActiveLLMProviderId(store)).toBe('openai-codex')
    expect(getActiveASRProviderId(store)).toBe('deepgram')
  })

  test('reads the active asr selectedModelId from provider settings', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'sherpa-onnx': {
          enabled: true,
          connectionType: 'local',
          config: { modelDir: '/tmp/m' }
        }
      },
      providerSettings: {
        'sherpa-onnx': { selectedModelId: 'paraformer-zh' }
      },
      activeProviders: { asr: 'sherpa-onnx' }
    })

    expect(getActiveASRSelectedModelId(store)).toBe('paraformer-zh')
  })

  test('returns undefined when the active asr provider has no selectedModelId', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'sherpa-onnx': {
          enabled: true,
          connectionType: 'local',
          config: { modelDir: '/tmp/m' }
        }
      },
      providerSettings: { 'sherpa-onnx': {} },
      activeProviders: { asr: 'sherpa-onnx' }
    })

    expect(getActiveASRSelectedModelId(store)).toBeUndefined()
  })

  test('resolveActiveASRSelection throws when selectedModelId is missing for a local provider', async () => {
    const { resolveActiveASRSelection } = await import('../providers/runtime')
    const { ASRProviderRegistry } = await import('@openbroca/providers/asr')

    const asrRegistry = new ASRProviderRegistry()
    asrRegistry.register({
      id: 'fake-local',
      displayName: 'Fake Local',
      description: '',
      kind: 'local',
      configSchema: { parse: (data: unknown) => (data ?? {}) as { modelDir?: string } },
      settingsSchema: { parse: (data: unknown) => (data ?? {}) as { selectedModelId?: string } },
      create: () => ({
        id: 'fake-local',
        displayName: 'Fake Local',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] }),
        listCatalogModels: async () => [],
        scanInstalledModels: async () => [],
        installModel: async function* () {},
        removeInstalledModel: async () => undefined,
        resolveModelRuntime: async () => ({ modelId: 'x', modelPath: '/x' })
      })
    })

    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'fake-local': {
          enabled: true,
          connectionType: 'local',
          config: { modelDir: '/tmp/fake' }
        }
      },
      providerSettings: { 'fake-local': {} },
      activeProviders: { asr: 'fake-local' }
    })

    await expect(
      resolveActiveASRSelection({ asrRegistry, store } as never)
    ).rejects.toThrow(/Select a local ASR model/i)
  })

  test('resolveActiveASRSelection throws when the selected model is not installed', async () => {
    const { resolveActiveASRSelection } = await import('../providers/runtime')
    const { ASRProviderRegistry } = await import('@openbroca/providers/asr')
    const { ConfigurationError } = await import('@openbroca/providers')

    const asrRegistry = new ASRProviderRegistry()
    asrRegistry.register({
      id: 'fake-local',
      displayName: 'Fake Local',
      description: '',
      kind: 'local',
      configSchema: { parse: (data: unknown) => (data ?? {}) as { modelDir?: string } },
      settingsSchema: { parse: (data: unknown) => (data ?? {}) as { selectedModelId?: string } },
      // create() runs in the child process now; the main-side test stubs the
      // host's invoke() to simulate the child's resolveModelRuntime throwing.
      create: () => ({
        id: 'fake-local',
        displayName: 'Fake Local',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] })
      })
    })

    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'fake-local': {
          enabled: true,
          connectionType: 'local',
          config: { modelDir: '/tmp/fake' }
        }
      },
      providerSettings: { 'fake-local': { selectedModelId: 'paraformer-zh' } },
      activeProviders: { asr: 'fake-local' }
    })

    providerHostStub.invoke.mockImplementationOnce(async (_instance, method, args) => {
      if (method === 'resolveModelRuntime') {
        throw new ConfigurationError(
          'fake-local',
          `Selected model "${(args as string[])[0]}" is not installed`
        )
      }
      return undefined
    })

    await expect(
      resolveActiveASRSelection({ asrRegistry, store } as never)
    ).rejects.toThrow(/not installed/i)
  })

  test('reads the active llm model from structured provider settings', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-4.1' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })

    expect(getActiveLLMModel(store)).toBe('gpt-4.1')
  })

  test('reads the active llm provider and model atomically from structured provider settings', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      providerSettings: {
        openai: { model: 'gpt-4.1' }
      },
      activeProviders: {
        llm: 'openai'
      }
    })

    expect(getActiveLLMSelection(store)).toEqual({
      providerId: 'openai',
      model: 'gpt-4.1'
    })
  })

  test('returns no active llm selection when provider or model is missing', () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'token' }
        }
      },
      activeProviders: {
        llm: 'openai'
      }
    })

    expect(getActiveLLMSelection(store)).toBeUndefined()
  })

  test('throws a clear configuration error when an active llm provider has no active model', async () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'openai-codex': {
          enabled: true,
          connectionType: 'oauth'
        }
      },
      activeProviders: {
        llm: 'openai-codex'
      }
    })

    await expect(resolveActiveLLMModel({ store })).rejects.toThrowError(
      '[provider:not-configured] Select an active LLM provider and model before requesting runtime access.'
    )
  })

  test('resolveActiveLLMProvider throws clear configuration error when no active llm is selected', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    const oauthService = new OAuthService({
      secureStorage,
      store,
      providers: {
        'openai-codex': {
          authorize: vi.fn(),
          dispose: vi.fn()
        }
      }
    })
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register(openrouterDescriptor)

    await expect(
      resolveActiveLLMProvider({
        llmRegistry,
        oauthService,
        store
      })
    ).rejects.toThrowError(
      '[provider:not-configured] Select an active LLM provider before requesting runtime access.'
    )
  })

  test('resolveActiveLLMSelection returns openrouter provider + active model from structured manual settings', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage

    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        openrouter: {
          enabled: true,
          connectionType: 'apiKey',
          config: {
            apiKey: 'or-key'
          }
        }
      },
      providerSettings: {
        openrouter: { model: 'openai/gpt-4.1-mini' }
      },
      activeProviders: {
        llm: 'openrouter'
      }
    })

    const oauthService = new OAuthService({
      secureStorage,
      store,
      providers: {}
    })

    expect(desktopLlmRegistry.listDescriptors().some((d) => d.id === openrouterDescriptor.id)).toBe(
      true
    )

    const selection = await resolveActiveLLMSelection({
      llmRegistry: desktopLlmRegistry,
      oauthService,
      store
    })

    expect(selection.provider.id).toBe('openrouter')
    expect(selection.model).toBe('openai/gpt-4.1-mini')
  })

  test('resolveActiveASRSelection returns ASR provider + saved settings from structured provider settings', async () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-key' }
        }
      },
      providerSettings: {
        deepgram: { language: ' zh ', punctuation: true }
      },
      activeProviders: {
        asr: 'deepgram'
      }
    })

    const asrRegistry = {
      getDescriptor: vi.fn().mockReturnValue(deepgramDescriptor),
      listDescriptors: () => [deepgramDescriptor],
      isLocal: () => false
    }

    providerHostStub.createInstance.mockClear()
    const selection = await resolveActiveASRSelection({
      asrRegistry,
      store
    } as never)

    // Validated config flows to the host; the proxy stands in for the provider.
    expect(providerHostStub.createInstance).toHaveBeenCalledWith(
      'asr',
      'deepgram',
      { apiKey: 'dg-key' }
    )
    expect(selection.provider.id).toBe('deepgram')
    expect(selection.settings).toEqual({ language: 'zh' })
  })

  test('resolveActiveASRSelection throws configuration error when persisted asr settings are invalid', async () => {
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-key' }
        }
      },
      providerSettings: {
        deepgram: { language: 'fr' }
      },
      activeProviders: {
        asr: 'deepgram'
      }
    })

    const asrRegistry = {
      resolve: vi.fn(),
      listDescriptors: () => [deepgramDescriptor]
    }

    await expect(resolveActiveASRSelection({ asrRegistry, store } as never)).rejects.toThrowError(
      /\[deepgram\] Provider settings are invalid/
    )
  })
})
