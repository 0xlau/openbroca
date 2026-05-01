import { beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import type { ProviderSetupStatus } from '@openbroca/providers'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import type { Context } from '../trpc/context'
import { llmRegistry as desktopLlmRegistry } from '../providers'
import { providersRouter } from '../trpc/routers/providers'
import { OAuthService } from '../auth/oauth-service'
import type { SecureStorage } from '../auth/secure-storage'

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

class MemoryStore {
  private state: Record<string, unknown> = {
    providers: {}
  }

  get<T>(key: string): T | undefined {
    return this.state[key] as T | undefined
  }

  set(key: string, value: unknown): void {
    this.state[key] = value
  }
}

function createAccessToken(accountId = 'acct_123'): string {
  return [
    'header',
    Buffer.from(
      JSON.stringify({
        'https://api.openai.com/auth': {
          chatgpt_account_id: accountId
        }
      })
    ).toString('base64url'),
    'signature'
  ].join('.')
}

describe('providersRouter', () => {
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

  test('listLLM includes provider-defined settings items', async () => {
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register({
      id: 'mock-llm',
      displayName: 'Mock LLM',
      description: 'Mock LLM provider',
      configSchema: z.object({}),
      settingsItems: [
        {
          key: 'model',
          type: 'model-select',
          label: 'Model',
          dataSource: 'llm-models'
        }
      ],
      create: () => ({
        id: 'mock-llm',
        displayName: 'Mock LLM',
        isConfigured: () => true,
        listModels: async () => [],
        generate: async () => ({ content: '', finishReason: 'stop' }),
        complete: async function* () {}
      })
    })

    const store = new MemoryStore()
    const asrRegistry = new ASRProviderRegistry()
    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const providers = await caller.listLLM()

    expect(providers.find((provider) => provider.id === 'mock-llm')).toMatchObject({
      settingsItems: [
        expect.objectContaining({
          key: 'model',
          type: 'model-select'
        })
      ]
    })
  })

  test('listModels resolves openai-codex from oauth state in main', async () => {
    const secureStorage = {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => JSON.stringify({ accessToken: createAccessToken('acct_codex') })),
      deleteSecret: vi.fn(async () => undefined)
    } satisfies SecureStorage
    const store = new MemoryStore()
    store.set('providers', {
      'openai-codex': {
        enabled: true,
        connectionType: 'oauth',
        account: {
          accountId: 'acct_codex'
        },
        auth: {
          status: 'connected',
          lastConnectedAt: '2026-03-30T00:00:00.000Z'
        }
      }
    })

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
    llmRegistry.register(openaiCodexDescriptor)

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      oauthService
    } as unknown as Context)

    const models = await caller.listModels({ providerId: 'openai-codex' })

    expect(models[0]).toEqual({ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' })
    expect(models).toHaveLength(6)
  })

  test('getSetupStatus returns provider-owned readiness for connected providers', async () => {
    const getSetupStatus = vi.fn(
      (): ProviderSetupStatus => ({
        status: 'configured',
        canActivate: false,
        summary: 'Mock status summary',
        blockingReasons: ['Some reason'],
        fieldErrors: {
          model: 'Choose a model'
        }
      })
    )

    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register({
      id: 'mock-llm',
      displayName: 'Mock LLM',
      description: 'Mock LLM provider',
      configSchema: z.object({}),
      getSetupStatus,
      create: () => ({
        id: 'mock-llm',
        displayName: 'Mock LLM',
        isConfigured: () => true,
        listModels: async () => [],
        generate: async () => ({ content: '', finishReason: 'stop' }),
        complete: async function* () {}
      })
    })

    const asrRegistry = new ASRProviderRegistry()
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'mock-llm': {
          enabled: true,
          connectionType: 'apiKey',
          config: {
            apiKey: 'mock-key'
          }
        }
      },
      providerSettings: {
        'mock-llm': {
          model: 'mock-model'
        }
      },
      activeProviders: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const status = await caller.getSetupStatus({ providerId: 'mock-llm', kind: 'llm' })

    expect(status).toEqual({
      status: 'configured',
      canActivate: false,
      summary: 'Mock status summary',
      blockingReasons: ['Some reason'],
      fieldErrors: {
        model: 'Choose a model'
      }
    })
    expect(getSetupStatus).toHaveBeenCalledWith({
      connection: expect.objectContaining({
        enabled: true,
        connectionType: 'apiKey'
      }),
      settings: expect.objectContaining({
        model: 'mock-model'
      })
    })
  })

  test('listASR returns normalized capabilities', async () => {
    const llmRegistry = new LLMProviderRegistry()
    const asrRegistry = new ASRProviderRegistry()
    const store = new MemoryStore()
    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    asrRegistry.register(deepgramDescriptor)
    asrRegistry.register({
      id: 'mock-asr',
      displayName: 'Mock ASR',
      description: 'Mock ASR provider',
      kind: 'cloud',
      configSchema: z.object({}),
      settingsItems: [
        {
          key: 'language',
          type: 'select',
          label: 'Language',
          options: [{ label: 'English', value: 'en' }]
        }
      ],
      create: () => ({
        id: 'mock-asr',
        displayName: 'Mock ASR',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] })
      })
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const providers = await caller.listASR()
    const deepgram = providers.find((provider) => provider.id === 'deepgram')
    const mock = providers.find((provider) => provider.id === 'mock-asr')

    expect(deepgram?.capabilities).toEqual({ nonStreaming: true, streaming: true })
    expect(mock?.capabilities).toEqual({ nonStreaming: true, streaming: false })
    expect(mock?.settingsItems).toEqual([
      expect.objectContaining({
        key: 'language',
        type: 'select'
      })
    ])
  })

  test('getSetupStatus routes through the ASR path', async () => {
    const getSetupStatus = vi.fn(
      (): ProviderSetupStatus => ({
        status: 'ready',
        canActivate: true,
        blockingReasons: []
      })
    )

    const llmRegistry = new LLMProviderRegistry()
    const asrRegistry = new ASRProviderRegistry()
    asrRegistry.register({
      id: 'mock-asr',
      displayName: 'Mock ASR',
      description: 'Mock ASR provider',
      kind: 'cloud',
      configSchema: z.object({}),
      getSetupStatus,
      create: () => ({
        id: 'mock-asr',
        displayName: 'Mock ASR',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] })
      })
    })

    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'mock-asr': {
          enabled: true,
          connectionType: 'apiKey',
          config: {
            apiKey: 'mock-key'
          }
        }
      },
      providerSettings: {
        'mock-asr': {
          language: 'en'
        }
      },
      activeProviders: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const status = await caller.getSetupStatus({ providerId: 'mock-asr', kind: 'asr' })

    expect(status).toEqual({
      status: 'ready',
      canActivate: true,
      blockingReasons: []
    })
    expect(getSetupStatus).toHaveBeenCalledWith({
      connection: expect.objectContaining({
        enabled: true,
        connectionType: 'apiKey'
      }),
      settings: expect.objectContaining({
        language: 'en'
      })
    })
  })

  test('getSetupStatus returns invalid for mismatched provider kind', async () => {
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register({
      id: 'mock-llm',
      displayName: 'Mock LLM',
      description: 'Mock LLM provider',
      configSchema: z.object({}),
      create: () => ({
        id: 'mock-llm',
        displayName: 'Mock LLM',
        isConfigured: () => true,
        listModels: async () => [],
        generate: async () => ({ content: '', finishReason: 'stop' }),
        complete: async function* () {}
      })
    })

    const asrRegistry = new ASRProviderRegistry()
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'mock-llm': {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'mock-key' }
        }
      },
      providerSettings: {},
      activeProviders: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const status = await caller.getSetupStatus({ providerId: 'mock-llm', kind: 'asr' })

    expect(status).toEqual({
      status: 'invalid',
      canActivate: false,
      blockingReasons: ['Provider is not available']
    })
  })

  test('getSetupStatus returns not-connected for disconnected providers', async () => {
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register({
      id: 'mock-llm',
      displayName: 'Mock LLM',
      description: 'Mock LLM provider',
      configSchema: z.object({}),
      create: () => ({
        id: 'mock-llm',
        displayName: 'Mock LLM',
        isConfigured: () => true,
        listModels: async () => [],
        generate: async () => ({ content: '', finishReason: 'stop' }),
        complete: async function* () {}
      })
    })

    const asrRegistry = new ASRProviderRegistry()
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'mock-llm': {
          enabled: false,
          connectionType: 'apiKey',
          config: { apiKey: 'mock-key' }
        }
      },
      providerSettings: {},
      activeProviders: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const status = await caller.getSetupStatus({ providerId: 'mock-llm', kind: 'llm' })

    expect(status).toEqual({
      status: 'not-connected',
      canActivate: false,
      blockingReasons: ['Connect the provider first']
    })
  })

  test('getSetupStatus returns default ready when descriptor has no getSetupStatus', async () => {
    const llmRegistry = new LLMProviderRegistry()
    llmRegistry.register({
      id: 'mock-llm',
      displayName: 'Mock LLM',
      description: 'Mock LLM provider',
      configSchema: z.object({}),
      create: () => ({
        id: 'mock-llm',
        displayName: 'Mock LLM',
        isConfigured: () => true,
        listModels: async () => [],
        generate: async () => ({ content: '', finishReason: 'stop' }),
        complete: async function* () {}
      })
    })

    const asrRegistry = new ASRProviderRegistry()
    const store = new MemoryStore()
    store.set('providers', {
      providers: {
        'mock-llm': {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'mock-key' }
        }
      },
      providerSettings: {
        'mock-llm': {
          any: 'value'
        }
      },
      activeProviders: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry,
      asrRegistry,
      oauthService
    } as unknown as Context)

    const status = await caller.getSetupStatus({ providerId: 'mock-llm', kind: 'llm' })

    expect(status).toEqual({
      status: 'ready',
      canActivate: true,
      blockingReasons: []
    })
  })

  test('listModels resolves openrouter from manual apiKey provider settings', async () => {
    expect(desktopLlmRegistry.listDescriptors().some((d) => d.id === openrouterDescriptor.id)).toBe(
      true
    )

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
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    })

    const oauthService = new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      } satisfies SecureStorage,
      store,
      providers: {}
    })

    const caller = providersRouter.createCaller({
      store,
      llmRegistry: desktopLlmRegistry,
      oauthService
    } as unknown as Context)

    const models = await caller.listModels({ providerId: 'openrouter' })
    expect(models).toEqual([
      { id: 'openai/gpt-4.1-mini', name: 'openai/gpt-4.1-mini', contextWindow: 128_000 }
    ])
  })

  describe('localModels', () => {
    function makeLocalAsrRegistryWithFake(opts: {
      catalogModels?: Array<{ id: string; name: string; sizeBytes: number; downloadUrl: string; sha256: string }>
      installedModels?: Array<{ id: string; name: string; path: string }>
      onInstall?: (modelId: string, signal?: AbortSignal) => AsyncIterable<{ phase: 'downloading' | 'extracting' | 'validating' | 'finalizing'; downloadedBytes?: number; totalBytes?: number }>
      onRemove?: (modelId: string) => Promise<void>
    }) {
      const asrRegistry = new ASRProviderRegistry()
      const fake = {
        id: 'fake-local',
        displayName: 'Fake Local',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] }),
        listCatalogModels: async () => opts.catalogModels ?? [],
        scanInstalledModels: async () => opts.installedModels ?? [],
        installModel: opts.onInstall ?? (async function* () {
          yield { phase: 'downloading', downloadedBytes: 0, totalBytes: 1 } as const
          yield { phase: 'extracting' } as const
          yield { phase: 'validating' } as const
          yield { phase: 'finalizing' } as const
        }),
        removeInstalledModel: opts.onRemove ?? (async () => undefined),
        resolveModelRuntime: async (id: string) => ({ modelId: id, modelPath: `/tmp/${id}` })
      }
      asrRegistry.register({
        id: 'fake-local',
        displayName: 'Fake Local',
        description: '',
        kind: 'local',
        configSchema: {
          parse: (data: unknown) => {
            const d = (data ?? {}) as { modelDir?: string }
            return { modelDir: d.modelDir ?? '/tmp/fake' }
          }
        },
        create: () => fake
      })
      return { asrRegistry, fake }
    }

    function seedStore(
      providerId: string,
      overrides?: { selectedModelId?: string; modelDir?: string; enabled?: boolean }
    ) {
      const store = new MemoryStore()
      store.set('providers', {
        providers: {
          [providerId]: {
            enabled: overrides?.enabled ?? true,
            connectionType: 'local',
            config: { modelDir: overrides?.modelDir ?? '/tmp/fake' }
          }
        },
        providerSettings: overrides?.selectedModelId
          ? { [providerId]: { selectedModelId: overrides.selectedModelId } }
          : {},
        activeProviders: {}
      })
      return store
    }

    function makeOauthService() {
      return new OAuthService({
        secureStorage: {
          setSecret: vi.fn(async () => undefined),
          getSecret: vi.fn(async () => null),
          deleteSecret: vi.fn(async () => undefined)
        } satisfies SecureStorage,
        store: new MemoryStore() as never,
        providers: {}
      })
    }

    test('getState works before any provider record exists (first-time Connect)', async () => {
      const { asrRegistry } = makeLocalAsrRegistryWithFake({
        catalogModels: [
          { id: 'paraformer-zh', name: 'Paraformer Chinese', sizeBytes: 1, downloadUrl: 'https://x', sha256: 'aa' }
        ],
        installedModels: []
      })
      const store = new MemoryStore()
      // No `providers` entry written yet — simulates the user clicking
      // Connect for the very first time.
      store.set('providers', { providers: {}, providerSettings: {}, activeProviders: {} })

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      const state = await caller.localModels.getState({ providerId: 'fake-local' })

      expect(state).toMatchObject({
        providerId: 'fake-local',
        modelDir: '/tmp/fake', // descriptor-default applied by configSchema.parse({})
        catalogModels: [expect.objectContaining({ id: 'paraformer-zh' })],
        installedModels: []
      })
      expect(state.selectedModelId).toBeUndefined()
    })

    test('getState returns catalog/installed/selected for a local provider', async () => {
      const { asrRegistry } = makeLocalAsrRegistryWithFake({
        catalogModels: [
          { id: 'paraformer-zh', name: 'Paraformer Chinese', sizeBytes: 1, downloadUrl: 'https://x', sha256: 'aa' }
        ],
        installedModels: [
          { id: 'paraformer-zh', name: 'Paraformer Chinese', path: '/tmp/fake/paraformer-zh' }
        ]
      })
      const store = seedStore('fake-local', { selectedModelId: 'paraformer-zh' })

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      const state = await caller.localModels.getState({ providerId: 'fake-local' })

      expect(state).toMatchObject({
        providerId: 'fake-local',
        modelDir: '/tmp/fake',
        selectedModelId: 'paraformer-zh',
        catalogModels: [expect.objectContaining({ id: 'paraformer-zh' })],
        installedModels: [expect.objectContaining({ id: 'paraformer-zh' })]
      })
    })

    test('select writes providerSettings.selectedModelId and enables the provider', async () => {
      const { asrRegistry } = makeLocalAsrRegistryWithFake({
        installedModels: [{ id: 'paraformer-zh', name: 'Paraformer Chinese', path: '/tmp/fake/paraformer-zh' }]
      })
      const store = seedStore('fake-local', { enabled: false })

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      const next = await caller.localModels.select({
        providerId: 'fake-local',
        modelId: 'paraformer-zh'
      })

      expect(next.selectedModelId).toBe('paraformer-zh')
      expect((store.get<{ providers: Record<string, { enabled: boolean }> }>('providers'))?.providers['fake-local']?.enabled).toBe(true)
    })

    test('install streams phase events and writes selectedModelId on completion', async () => {
      const { asrRegistry } = makeLocalAsrRegistryWithFake({})
      const store = seedStore('fake-local')

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      const phases: string[] = []
      for await (const event of await caller.localModels.install({
        providerId: 'fake-local',
        modelId: 'paraformer-zh'
      })) {
        phases.push(event.phase)
      }

      expect(phases).toEqual(['downloading', 'extracting', 'validating', 'finalizing'])
      const persisted = store.get<{ providerSettings: Record<string, { selectedModelId?: string }> }>('providers')
      expect(persisted?.providerSettings['fake-local']?.selectedModelId).toBe('paraformer-zh')
    })

    test('install rejects a second install for a different modelId while one is running', async () => {
      let release!: () => void
      const block = new Promise<void>((resolve) => {
        release = resolve
      })

      const { asrRegistry } = makeLocalAsrRegistryWithFake({
        onInstall: async function* () {
          yield { phase: 'downloading', downloadedBytes: 0, totalBytes: 1 } as const
          await block
        }
      })
      const store = seedStore('fake-local')

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      // Start first install but don't drain it; pull only the first event
      // so the inFlight handle is registered.
      const iter1 = (await caller.localModels.install({
        providerId: 'fake-local',
        modelId: 'paraformer-zh'
      }))[Symbol.asyncIterator]()
      await iter1.next()

      try {
        await expect(
          (async () => {
            for await (const _ of await caller.localModels.install({
              providerId: 'fake-local',
              modelId: 'zipformer-en-small'
            })) {
              // pull events
            }
          })()
        ).rejects.toThrow(/Another install/)
      } finally {
        release()
        // drain the first iterator so cleanup runs and inFlightInstalls clears.
        for await (const _ of { [Symbol.asyncIterator]: () => iter1 }) {
          // pump remaining
        }
      }
    })

    test('remove deletes via provider and refuses to remove the active model', async () => {
      const onRemove = vi.fn(async () => undefined)
      const { asrRegistry } = makeLocalAsrRegistryWithFake({ onRemove })
      const store = seedStore('fake-local', { selectedModelId: 'paraformer-zh' })

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      await expect(
        caller.localModels.remove({ providerId: 'fake-local', modelId: 'paraformer-zh' })
      ).rejects.toThrow(/active model/i)

      await caller.localModels.remove({ providerId: 'fake-local', modelId: 'zipformer-en-small' })
      expect(onRemove).toHaveBeenCalledWith('zipformer-en-small')
    })

    test('changeDirectory writes config.modelDir and clears selectedModelId', async () => {
      const { asrRegistry } = makeLocalAsrRegistryWithFake({})
      const store = seedStore('fake-local', { selectedModelId: 'paraformer-zh' })

      const caller = providersRouter.createCaller({
        store,
        llmRegistry: new LLMProviderRegistry(),
        asrRegistry,
        oauthService: makeOauthService()
      } as unknown as Context)

      const state = await caller.localModels.changeDirectory({
        providerId: 'fake-local',
        modelDir: '/elsewhere'
      })

      expect(state.modelDir).toBe('/elsewhere')
      expect(state.selectedModelId).toBeUndefined()
      const persisted = store.get<{
        providers: Record<string, { config?: { modelDir?: string } }>
        providerSettings: Record<string, { selectedModelId?: string } | undefined>
      }>('providers')
      expect(persisted?.providers['fake-local']?.config?.modelDir).toBe('/elsewhere')
      expect(persisted?.providerSettings['fake-local']?.selectedModelId).toBeUndefined()
    })
  })
})
