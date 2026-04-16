# Provider-Defined Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop app's LLM-only model-settings flow with a provider-defined settings platform that supports unified settings UI, provider-owned readiness, `providerSettings` persistence, and runtime resolution from the active provider's current settings.

**Architecture:** Extend the shared provider descriptor contracts with standard settings metadata and a provider-owned setup-status hook, migrate desktop persistence from `providerModels`/`activeModels` to `providerSettings`, and move readiness/status evaluation into main-process helpers exposed through tRPC. Then replace the renderer's dedicated model-settings dialog with a unified `ProviderSettingsDialog`, and update runtime helpers plus the post-recording pipeline to read the active provider's current settings directly.

**Tech Stack:** TypeScript, Zod, Electron main/renderer split, tRPC, Zustand, React, Vitest

---

### Task 1: Add Shared Provider Settings Contracts

**Files:**
- Create: `packages/providers/src/shared/settings.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/src/llm/contracts.ts`
- Modify: `packages/providers/src/llm/index.ts`
- Modify: `packages/providers/src/asr/contracts.ts`
- Modify: `packages/providers/src/asr/index.ts`
- Test: `packages/providers/src/llm/__tests__/registry.test.ts`
- Test: `packages/providers/src/asr/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing registry tests for descriptor-carried settings metadata**

```ts
it('preserves settings metadata on registered llm descriptors', () => {
  const registry = new LLMProviderRegistry()
  registry.register(
    makeDescriptor('settings-llm', {
      settingsItems: [
        {
          key: 'model',
          type: 'model-select',
          label: 'Model',
          description: 'Choose the runtime model'
        }
      ],
      getSetupStatus: () => ({
        status: 'configured',
        canActivate: false,
        blockingReasons: ['Model is required']
      })
    })
  )

  expect(registry.listDescriptors()[0]).toMatchObject({
    id: 'settings-llm',
    settingsItems: [
      expect.objectContaining({
        key: 'model',
        type: 'model-select'
      })
    ]
  })
})
```

```ts
it('preserves settings metadata on registered asr descriptors', () => {
  const registry = new ASRProviderRegistry()
  registry.register({
    ...makeCloudDescriptor('settings-asr'),
    settingsItems: [
      {
        key: 'language',
        type: 'select',
        label: 'Language',
        description: 'Choose the default language',
        options: [{ label: 'English', value: 'en' }]
      }
    ],
    getSetupStatus: () => ({
      status: 'ready',
      canActivate: true,
      blockingReasons: []
    })
  })

  expect(registry.listDescriptors()[0]).toMatchObject({
    id: 'settings-asr',
    settingsItems: [
      expect.objectContaining({
        key: 'language',
        type: 'select'
      })
    ]
  })
})
```

- [ ] **Step 2: Run the provider package tests to verify the new fields do not exist yet**

Run:

```bash
pnpm vitest run packages/providers/src/llm/__tests__/registry.test.ts packages/providers/src/asr/__tests__/registry.test.ts
```

Expected: FAIL with TypeScript or runtime errors complaining that `settingsItems` and `getSetupStatus` are not valid descriptor fields.

- [ ] **Step 3: Add the shared settings types and thread them through both descriptor contracts**

```ts
// packages/providers/src/shared/settings.ts
export interface ProviderSettingsOption {
  label: string
  value: string
}

interface ProviderSettingsItemBase {
  key: string
  label: string
  description?: string
  required?: boolean
}

export interface ProviderTextSettingsItem extends ProviderSettingsItemBase {
  type: 'text'
  placeholder?: string
}

export interface ProviderPasswordSettingsItem extends ProviderSettingsItemBase {
  type: 'password'
  placeholder?: string
}

export interface ProviderToggleSettingsItem extends ProviderSettingsItemBase {
  type: 'toggle'
  defaultValue?: boolean
}

export interface ProviderSelectSettingsItem extends ProviderSettingsItemBase {
  type: 'select'
  options: ProviderSettingsOption[]
}

export interface ProviderModelSelectSettingsItem extends ProviderSettingsItemBase {
  type: 'model-select'
  dataSource: 'llm-models'
}

export type ProviderSettingsItem =
  | ProviderTextSettingsItem
  | ProviderPasswordSettingsItem
  | ProviderToggleSettingsItem
  | ProviderSelectSettingsItem
  | ProviderModelSelectSettingsItem

export interface ProviderSetupStatus {
  status: 'not-connected' | 'configured' | 'invalid' | 'ready'
  canActivate: boolean
  summary?: string
  blockingReasons: string[]
  fieldErrors?: Record<string, string>
}

export interface ProviderSetupContext {
  connection?: unknown
  settings?: Record<string, unknown>
  runtimeConfig?: unknown
}
```

```ts
// packages/providers/src/llm/contracts.ts
import type {
  ProviderSettingsItem,
  ProviderSetupContext,
  ProviderSetupStatus
} from '../shared/settings.ts'

export interface LLMProviderDescriptor<TConfig = unknown, TSettings = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<LLMCapabilities>
  connectionOptions?: ProviderConnectionOption[]
  secureStorage?: ProviderSecureStorageOption
  settingsSchema?: ConfigSchema<TSettings>
  settingsItems?: ProviderSettingsItem[]
  getSetupStatus?: (
    context: ProviderSetupContext
  ) => Promise<ProviderSetupStatus> | ProviderSetupStatus
  create(config: TConfig): LLMProvider
}
```

```ts
// packages/providers/src/asr/contracts.ts
import type {
  ProviderSettingsItem,
  ProviderSetupContext,
  ProviderSetupStatus
} from '../shared/settings.ts'

export interface ASRProviderDescriptor<TConfig = unknown, TSettings = unknown> {
  id: string
  displayName: string
  description: string
  icon?: string
  kind: 'cloud' | 'local'
  configSchema: ConfigSchema<TConfig>
  capabilities?: Partial<ASRCapabilities>
  connectionOptions?: ProviderConnectionOption[]
  settingsSchema?: ConfigSchema<TSettings>
  settingsItems?: ProviderSettingsItem[]
  getSetupStatus?: (
    context: ProviderSetupContext
  ) => Promise<ProviderSetupStatus> | ProviderSetupStatus
  create(config: TConfig): ASRProvider | StreamingASRProvider | LocalASRProvider
}
```

- [ ] **Step 4: Run the focused provider tests to verify the shared contract compiles and passes**

Run:

```bash
pnpm vitest run packages/providers/src/llm/__tests__/registry.test.ts packages/providers/src/asr/__tests__/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the provider contract layer**

```bash
git add packages/providers/src/shared/settings.ts packages/providers/src/index.ts packages/providers/src/llm/contracts.ts packages/providers/src/llm/index.ts packages/providers/src/asr/contracts.ts packages/providers/src/asr/index.ts packages/providers/src/llm/__tests__/registry.test.ts packages/providers/src/asr/__tests__/registry.test.ts
git commit -m "refactor: add shared provider settings contract"
```

### Task 2: Migrate Desktop Persistence To `providerSettings`

**Files:**
- Modify: `apps/desktop/src/shared/provider-auth.ts`
- Modify: `apps/desktop/src/renderer/src/stores/provider-store.ts`
- Modify: `apps/desktop/src/main/auth/oauth-service.ts`
- Test: `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`
- Test: `apps/desktop/src/main/__tests__/oauth-service.test.ts`

- [ ] **Step 1: Write failing tests for normalization and cleanup under the new persisted shape**

```ts
test('migrates providerModels into providerSettings on hydrate', async () => {
  storeGetQueryMock.mockResolvedValueOnce({
    providers: {
      openrouter: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'or-key' }
      }
    },
    providerModels: {
      openrouter: { model: 'openai/gpt-4.1-mini' }
    },
    activeProviders: {
      llm: 'openrouter'
    },
    activeModels: {
      llm: 'openai/gpt-4.1-mini'
    }
  })
  storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

  const { providerStore } = await import('../provider-store')
  await providerStore.getState().hydrate()

  expect(providerStore.getState().data).toEqual({
    providers: {
      openrouter: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'or-key' }
      }
    },
    providerSettings: {
      openrouter: { model: 'openai/gpt-4.1-mini' }
    },
    activeProviders: {
      llm: 'openrouter'
    }
  })
})
```

```ts
test('oauth disconnect removes provider settings for the disconnected provider', async () => {
  const store = new MemoryStore()
  const service = new OAuthService({
    secureStorage: {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => JSON.stringify({ accessToken: 'token' })),
      deleteSecret: vi.fn(async () => undefined)
    },
    store,
    providers: {
      'openai-codex': {
        authorize: vi.fn(),
        dispose: vi.fn()
      }
    }
  })
  store.set('providers', {
    providers: {
      'openai-codex': {
        enabled: true,
        connectionType: 'oauth',
        auth: {
          status: 'connected',
          lastConnectedAt: '2026-04-06T00:00:00.000Z'
        }
      }
    },
    providerSettings: {
      'openai-codex': { model: 'gpt-5.2-codex' }
    },
    activeProviders: {
      llm: 'openai-codex'
    }
  })

  await service.disconnect('openai-codex')

  expect(store.get('providers')).toEqual({
    providers: {},
    providerSettings: {},
    activeProviders: {}
  })
})
```

- [ ] **Step 2: Run the desktop persistence tests to verify the old state model still breaks them**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/oauth-service.test.ts
```

Expected: FAIL because the code still expects `providerModels` and `activeModels`.

- [ ] **Step 3: Replace the old state shape with `providerSettings` and add forward migration from legacy model state**

```ts
// apps/desktop/src/shared/provider-auth.ts
export interface ProviderSettings {
  providers: Record<string, ProviderConnectionRecord | undefined>
  providerSettings: Record<string, Record<string, unknown> | undefined>
  activeProviders: ActiveProviders
}

export const defaultProviderSettings: ProviderSettings = {
  providers: {},
  providerSettings: {},
  activeProviders: {}
}

export function removeProviderState(
  settings: ProviderSettings,
  providerId: string
): ProviderSettings {
  const nextProviders = { ...settings.providers }
  const nextProviderSettings = { ...settings.providerSettings }
  const nextActiveProviders = clearActiveProviderSelections(settings.activeProviders, providerId)

  delete nextProviders[providerId]
  delete nextProviderSettings[providerId]

  return {
    providers: nextProviders,
    providerSettings: nextProviderSettings,
    activeProviders: nextActiveProviders
  }
}

export function normalizeProviderSettings(raw: unknown): ProviderSettings {
  if (!isRecord(raw)) {
    return defaultProviderSettings
  }

  const providers = isRecord(raw.providers)
    ? ({ ...raw.providers } as Record<string, ProviderConnectionRecord | undefined>)
    : ({ ...raw } as Record<string, ProviderConnectionRecord | undefined>)

  const providerSettings: Record<string, Record<string, unknown> | undefined> = {}
  const rawProviderSettings = isRecord(raw.providerSettings)
    ? raw.providerSettings
    : {}
  const rawProviderModels = isRecord(raw.providerModels)
    ? raw.providerModels
    : {}

  for (const [providerId, value] of Object.entries(rawProviderSettings)) {
    if (hasOwnRecord(providers, providerId) && isRecord(value)) {
      providerSettings[providerId] = { ...value }
    }
  }

  for (const [providerId, value] of Object.entries(rawProviderModels)) {
    if (!hasOwnRecord(providers, providerId) || !isRecord(value)) {
      continue
    }
    const model = typeof value.model === 'string' ? value.model.trim() : ''
    if (!model) continue
    providerSettings[providerId] = {
      ...(providerSettings[providerId] ?? {}),
      model
    }
  }

  const activeProviders: ActiveProviders = {}
  const rawActiveProviders = isRecord(raw.activeProviders) ? raw.activeProviders : {}
  if (typeof rawActiveProviders.llm === 'string' && hasOwnRecord(providers, rawActiveProviders.llm)) {
    activeProviders.llm = rawActiveProviders.llm
  }
  if (typeof rawActiveProviders.asr === 'string' && hasOwnRecord(providers, rawActiveProviders.asr)) {
    activeProviders.asr = rawActiveProviders.asr
  }

  return {
    providers,
    providerSettings,
    activeProviders
  }
}
```

```ts
// apps/desktop/src/renderer/src/stores/provider-store.ts
const next = normalizeProviderSettings({
  ...current,
  ...partial,
  providers: {
    ...current.providers,
    ...(partial.providers ?? {})
  },
  providerSettings: {
    ...current.providerSettings,
    ...(partial.providerSettings ?? {})
  },
  activeProviders: nextActiveProviders
})
```

```ts
// apps/desktop/src/main/auth/oauth-service.ts
const settingsChanged =
  nextSettings.providers !== settings.providers ||
  nextSettings.providerSettings !== settings.providerSettings ||
  nextSettings.activeProviders !== settings.activeProviders

private hasRawProviderModel(rawSettings: unknown, providerId: string): boolean {
  if (!isRecord(rawSettings) || !isRecord(rawSettings.providerModels)) {
    return false
  }
  return Object.prototype.hasOwnProperty.call(rawSettings.providerModels, providerId)
}
```

- [ ] **Step 4: Run the desktop persistence tests again to verify migration and cleanup behavior**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/oauth-service.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the persistence migration**

```bash
git add apps/desktop/src/shared/provider-auth.ts apps/desktop/src/renderer/src/stores/provider-store.ts apps/desktop/src/main/auth/oauth-service.ts apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/oauth-service.test.ts
git commit -m "refactor: migrate provider state to provider settings"
```

### Task 3: Add Main-Process Setup-Status Resolution And Router APIs

**Files:**
- Create: `apps/desktop/src/main/providers/setup-status.ts`
- Modify: `apps/desktop/src/main/trpc/routers/providers.ts`
- Modify: `apps/desktop/src/main/__tests__/providers-router.test.ts`
- Modify: `apps/desktop/src/main/providers/runtime.ts`

- [ ] **Step 1: Write failing main-process tests for serialized settings metadata and setup-status queries**

```ts
test('listLLM includes provider-defined settings items', async () => {
  const caller = providersRouter.createCaller({
    store,
    llmRegistry: desktopLlmRegistry,
    asrRegistry,
    oauthService
  } as unknown as Context)

  const providers = await caller.listLLM()

  expect(providers.find((provider) => provider.id === 'openrouter')).toMatchObject({
    settingsItems: [
      expect.objectContaining({
        key: 'model',
        type: 'model-select'
      })
    ]
  })
})
```

```ts
test('getSetupStatus returns provider-owned readiness for connected providers', async () => {
  store.set('providers', {
    providers: {
      openrouter: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'or-key' }
      }
    },
    providerSettings: {},
    activeProviders: {}
  })

  const status = await caller.getSetupStatus({ providerId: 'openrouter', kind: 'llm' })

  expect(status).toEqual({
    status: 'configured',
    canActivate: false,
    summary: 'Choose a model before activating OpenRouter.',
    blockingReasons: ['Model is required'],
    fieldErrors: {
      model: 'Choose a model'
    }
  })
})
```

- [ ] **Step 2: Run the focused main-process tests to verify the APIs do not exist yet**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: FAIL because `settingsItems` are not serialized and `getSetupStatus` is missing.

- [ ] **Step 3: Add a dedicated setup-status helper and expose it through the providers router**

```ts
// apps/desktop/src/main/providers/setup-status.ts
import { normalizeProviderSettings } from '../../shared/provider-auth'
import type { ProviderSetupStatus } from '@openbroca/providers'
import { getLLMProviderRuntimeConfig } from './runtime'

export async function resolveLLMSetupStatus(
  providerId: string,
  deps: LLMProviderRuntimeDeps
): Promise<ProviderSetupStatus> {
  const settings = normalizeProviderSettings(deps.store.get('providers'))
  const descriptor = deps.llmRegistry.listDescriptors().find((entry) => entry.id === providerId)
  const connection = settings.providers[providerId]
  const providerSettings = settings.providerSettings[providerId]

  if (!connection?.enabled) {
    return {
      status: 'not-connected',
      canActivate: false,
      blockingReasons: ['Connect the provider first']
    }
  }

  if (!descriptor?.getSetupStatus) {
    return {
      status: 'ready',
      canActivate: true,
      blockingReasons: []
    }
  }

  const runtimeConfig = await getLLMProviderRuntimeConfig(providerId, deps)
  return descriptor.getSetupStatus({
    connection,
    settings: providerSettings,
    runtimeConfig
  })
}
```

```ts
// apps/desktop/src/main/trpc/routers/providers.ts
getSetupStatus: publicProcedure
  .input(
    z.object({
      providerId: z.string(),
      kind: z.enum(['llm', 'asr'])
    })
  )
  .query(async ({ ctx, input }) => {
    return input.kind === 'llm'
      ? resolveLLMSetupStatus(input.providerId, {
          llmRegistry: ctx.llmRegistry,
          oauthService: ctx.oauthService,
          store: ctx.store
        })
      : resolveASRSetupStatus(input.providerId, {
          asrRegistry: ctx.asrRegistry,
          store: ctx.store
        })
  }),

listLLM: publicProcedure.query(({ ctx }) => {
  return ctx.llmRegistry.listDescriptors().map((d) => ({
    id: d.id,
    displayName: d.displayName,
    description: d.description,
    icon: d.icon ?? null,
    capabilities: d.capabilities ?? null,
    connectionOptions: d.connectionOptions ?? [],
    settingsItems: d.settingsItems ?? []
  }))
})
```

- [ ] **Step 4: Run the main-process router tests to verify the new setup-status API works**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the main-process setup-status layer**

```bash
git add apps/desktop/src/main/providers/setup-status.ts apps/desktop/src/main/trpc/routers/providers.ts apps/desktop/src/main/__tests__/providers-router.test.ts apps/desktop/src/main/providers/runtime.ts
git commit -m "feat: add provider setup status queries"
```

### Task 4: Declare Settings Items And Readiness On Real Providers

**Files:**
- Modify: `packages/providers/src/llm/providers/openai/index.ts`
- Modify: `packages/providers/src/llm/providers/openrouter/index.ts`
- Modify: `packages/providers/src/llm/providers/openai-codex/index.ts`
- Modify: `packages/providers/src/asr/providers/deepgram/index.ts`
- Test: `packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts`
- Test: `packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
- Test: `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`

- [ ] **Step 1: Write failing descriptor tests for model-select and Deepgram language settings**

```ts
it('declares model-select settings and configured status for OpenRouter', async () => {
  expect(openrouterDescriptor.settingsItems).toEqual([
    expect.objectContaining({
      key: 'model',
      type: 'model-select',
      dataSource: 'llm-models'
    })
  ])

  await expect(
    openrouterDescriptor.getSetupStatus?.({
      connection: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'or-key' }
      },
      settings: {},
      runtimeConfig: { apiKey: 'or-key' }
    })
  ).resolves.toMatchObject({
    status: 'configured',
    canActivate: false,
    fieldErrors: { model: 'Choose a model' }
  })
})
```

```ts
it('declares optional language settings for Deepgram', async () => {
  expect(deepgramDescriptor.settingsItems).toEqual([
    expect.objectContaining({
      key: 'language',
      type: 'select'
    })
  ])

  await expect(
    deepgramDescriptor.getSetupStatus?.({
      connection: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'dg-key' }
      },
      settings: {},
      runtimeConfig: { apiKey: 'dg-key' }
    })
  ).resolves.toEqual({
    status: 'ready',
    canActivate: true,
    summary: 'Uses the saved default language when no runtime override is provided.',
    blockingReasons: []
  })
})
```

- [ ] **Step 2: Run the provider descriptor tests to verify the real descriptors do not expose the new behavior yet**

Run:

```bash
pnpm vitest run packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts
```

Expected: FAIL because the descriptors still only describe connection fields.

- [ ] **Step 3: Add `settingsSchema`, `settingsItems`, and `getSetupStatus()` to the real provider descriptors**

```ts
// packages/providers/src/llm/providers/openrouter/index.ts
const settingsSchema = z.object({
  model: z.string().trim().min(1, 'Choose a model')
})

export const openrouterDescriptor: LLMProviderDescriptor<OpenRouterConfig, z.infer<typeof settingsSchema>> = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'OpenRouter hosted models',
  icon: providerIcons.openrouter,
  configSchema,
  settingsSchema,
  settingsItems: [
    {
      key: 'model',
      type: 'model-select',
      label: 'Model',
      description: 'Choose which OpenRouter model this provider should use by default.',
      required: true,
      dataSource: 'llm-models'
    }
  ],
  getSetupStatus: async ({ settings, runtimeConfig }) => {
    const model = typeof settings?.model === 'string' ? settings.model.trim() : ''
    if (!model) {
      return {
        status: 'configured',
        canActivate: false,
        summary: 'Choose a model before activating OpenRouter.',
        blockingReasons: ['Model is required'],
        fieldErrors: { model: 'Choose a model' }
      }
    }

    const provider = new OpenRouterLLMProvider(configSchema.parse(runtimeConfig ?? {}))
    const models = await provider.listModels()
    if (!models.some((entry) => entry.id === model)) {
      return {
        status: 'invalid',
        canActivate: false,
        summary: 'The saved model is not available for this account.',
        blockingReasons: ['Selected model is unavailable'],
        fieldErrors: { model: 'Selected model is unavailable' }
      }
    }

    return {
      status: 'ready',
      canActivate: true,
      summary: `Model: ${model}`,
      blockingReasons: []
    }
  },
  create: (config) => new OpenRouterLLMProvider(config)
}
```

```ts
// packages/providers/src/asr/providers/deepgram/index.ts
const settingsSchema = z.object({
  language: z.string().trim().optional()
})

export const deepgramDescriptor: ASRProviderDescriptor<DeepgramConfig, z.infer<typeof settingsSchema>> = {
  id: 'deepgram',
  displayName: 'Deepgram',
  description: 'Real-time speech recognition via the Deepgram Nova API',
  icon: providerIcons.deepgram,
  kind: 'cloud',
  configSchema,
  settingsSchema,
  settingsItems: [
    {
      key: 'language',
      type: 'select',
      label: 'Language',
      description: 'Default language used when the runtime request does not override it.',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Mandarin Chinese', value: 'zh' }
      ]
    }
  ],
  getSetupStatus: () => ({
    status: 'ready',
    canActivate: true,
    summary: 'Uses the saved default language when no runtime override is provided.',
    blockingReasons: []
  }),
  capabilities: { streaming: true },
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      description: 'Enter a Deepgram API key to enable real-time transcription.',
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          input: 'password',
          required: true,
          description: 'Your Deepgram API key.'
        }
      ]
    }
  ],
  create: (config) => new DeepgramASRProvider(config)
}
```

- [ ] **Step 4: Run the provider descriptor tests to verify real providers advertise settings and readiness**

Run:

```bash
pnpm vitest run packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the descriptor wiring**

```bash
git add packages/providers/src/llm/providers/openai/index.ts packages/providers/src/llm/providers/openrouter/index.ts packages/providers/src/llm/providers/openai-codex/index.ts packages/providers/src/asr/providers/deepgram/index.ts packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts
git commit -m "feat: let providers declare settings and readiness"
```

### Task 5: Replace The Renderer Model Dialog With A Unified Settings Dialog

**Files:**
- Create: `apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-section.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Delete: `apps/desktop/src/renderer/src/components/providers/provider-model-settings-dialog.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write failing renderer tests for unified settings, setup-status gating, and providerSettings persistence**

```ts
let providerSetupStatus: Record<string, ProviderSetupStatus> = {}

test('opens a unified settings dialog for connected providers with settings items', async () => {
  providerSetupStatus = {}
  llmProviders = [
    {
      ...openRouterProviderFixture,
      settingsItems: [
        {
          key: 'model',
          type: 'model-select',
          label: 'Model',
          description: 'Choose a model',
          dataSource: 'llm-models'
        }
      ]
    }
  ]

  providerSetupStatus.openrouter = {
    status: 'configured',
    canActivate: false,
    summary: 'Choose a model before activating OpenRouter.',
    blockingReasons: ['Model is required'],
    fieldErrors: {
      model: 'Choose a model'
    }
  }

  render(<Providers />)
  fireEvent.click(screen.getByRole('button', { name: 'Open settings for OpenRouter' }))

  expect(screen.getByRole('heading', { name: 'Settings for OpenRouter' })).toBeTruthy()
  expect(screen.getByText('Choose a model before activating OpenRouter.')).toBeTruthy()
})
```

```ts
test('saving provider settings writes providerSettings instead of providerModels', async () => {
  render(<Providers />)
  fireEvent.click(screen.getByRole('button', { name: 'Open settings for OpenRouter' }))
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByRole('button', { name: 'openai/gpt-4.1-mini' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

  await waitFor(() => {
    expect(providerStore.getState().update).toHaveBeenCalledWith({
      providerSettings: {
        openrouter: {
          model: 'openai/gpt-4.1-mini'
        }
      }
    })
  })
})
```

- [ ] **Step 2: Run the renderer providers-page test file to verify the old LLM-only dialog still fails the new expectations**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: FAIL because the page still opens `ProviderModelSettingsDialog`, reads `providerModels`, and locally infers readiness.

- [ ] **Step 3: Build `ProviderSettingsDialog`, wire row-level status queries, and persist unified settings**

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx
export function ProviderSettingsDialog({
  provider,
  open,
  savedSettings,
  onOpenChange,
  onSave
}: {
  provider: ProviderViewModel | null
  open: boolean
  savedSettings?: Record<string, unknown>
  onOpenChange: (next: boolean) => void
  onSave: (providerId: string, settings: Record<string, unknown>) => Promise<void>
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>({})
  const { data: models } = trpc.providers.listModels.useQuery(
    { providerId: provider?.id ?? '' },
    {
      enabled: open && !!provider?.settingsItems?.some((item) => item.type === 'model-select')
    }
  )

  React.useEffect(() => {
    if (open && provider) {
      setValues(savedSettings ?? {})
    }
  }, [open, provider, savedSettings])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!provider) return
    await onSave(provider.id, values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {provider ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Settings for {provider.displayName}</DialogTitle>
              <DialogDescription>{provider.setupStatus?.summary ?? provider.description}</DialogDescription>
            </DialogHeader>
            {provider.settingsItems.map((item) => renderSettingsItem(item, values, setValues, models))}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Save settings</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
```

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-row.tsx
const { data: setupStatus } = trpc.providers.getSetupStatus.useQuery({
  providerId: provider.id,
  kind: section
})

const supportsSettings = (provider.settingsItems?.length ?? 0) > 0
const canActivate = setupStatus?.canActivate ?? state.isConnected

const settingsButton =
  state.isConnected && supportsSettings && onOpenSettings ? (
    <Button
      variant="ghost"
      size="icon-sm"
      className="shrink-0"
      aria-label={`Open settings for ${provider.displayName}`}
      onClick={() => onOpenSettings(provider)}
    >
      <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} size={14} />
    </Button>
  ) : null

<Button
  variant={state.isActive ? 'secondary' : 'ghost'}
  size="sm"
  className="shrink-0 gap-1.5"
  onClick={() => onSetActive(provider.id)}
  disabled={!canActivate || state.isActive}
>
  {state.isActive ? 'Current' : 'Set as active'}
</Button>
```

```tsx
// apps/desktop/src/renderer/src/pages/main/providers.tsx
async function handleSaveProviderSettings(providerId: string, settings: Record<string, unknown>) {
  await providerStore.getState().update({
    providerSettings: {
      [providerId]: settings
    }
  })
}
```

- [ ] **Step 4: Run the renderer providers-page tests to verify the unified dialog and status gating**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit the unified renderer settings flow**

```bash
git add apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx apps/desktop/src/renderer/src/components/providers/provider-types.ts apps/desktop/src/renderer/src/components/providers/provider-row.tsx apps/desktop/src/renderer/src/components/providers/provider-section.tsx apps/desktop/src/renderer/src/pages/main/providers.tsx apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git rm apps/desktop/src/renderer/src/components/providers/provider-model-settings-dialog.tsx
git commit -m "feat: unify provider settings in the renderer"
```

### Task 6: Read Active Provider Settings Directly In Runtime And Pipeline Code

**Files:**
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Test: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Write failing runtime tests for reading `model` from `providerSettings` and `language` from the active ASR provider**

```ts
test('resolveActiveLLMSelection reads model from providerSettings', async () => {
  store.set('providers', {
    providers: {
      openrouter: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'or-key' }
      }
    },
    providerSettings: {
      openrouter: {
        model: 'openai/gpt-4.1-mini'
      }
    },
    activeProviders: {
      llm: 'openrouter'
    }
  })

  const selection = await resolveActiveLLMSelection({
    llmRegistry: desktopLlmRegistry,
    oauthService,
    store
  })

  expect(selection.model).toBe('openai/gpt-4.1-mini')
})
```

```ts
test('post recording pipeline uses saved Deepgram language when no runtime override is supplied', async () => {
  const recognize = vi.fn().mockResolvedValue({
    text: 'hello',
    segments: []
  })
  const llmProvider = {
    id: 'openrouter',
    displayName: 'OpenRouter',
    isConfigured: () => true,
    listModels: vi.fn(async () => []),
    generate: vi.fn(async () => ({ content: 'summary', finishReason: 'stop' as const })),
    complete: vi.fn(async function* () {
      yield { delta: 'summary', finishReason: 'stop' as const }
    })
  }
  const record = {
    id: 'record-1',
    audioFilePath: '/tmp/audio.wav',
    createdAt: '2026-04-06T00:00:00.000Z'
  }
  const historyRepository = {
    update: vi.fn(),
    create: vi.fn()
  }
  const recordingRepository = {
    get: vi.fn()
  }
  const transcriptRepository = {
    save: vi.fn()
  }
  const summaryRepository = {
    save: vi.fn()
  }

  const pipeline = new PostRecordingPipeline({
    resolveActiveASRSelection: vi.fn().mockResolvedValue({
      provider: {
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize
      },
      settings: {
        language: 'zh'
      }
    }),
    resolveActiveLLMSelection: vi.fn().mockResolvedValue({
      provider: llmProvider,
      model: 'gpt-5.2'
    }),
    historyRepository,
    recordingRepository,
    transcriptRepository,
    summaryRepository,
    now: () => new Date('2026-04-06T00:00:00.000Z')
  })

  await pipeline.process(record)

  expect(recognize).toHaveBeenCalledWith(expect.any(Object), { language: 'zh' })
})
```

- [ ] **Step 2: Run the runtime and pipeline tests to verify the old helpers still depend on `activeModels` and hardcoded English**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected: FAIL because `resolveActiveLLMSelection()` still reads `activeModels` and `post-recording-pipeline.ts` still sends `{ language: 'en' }`.

- [ ] **Step 3: Remove the old active-model helpers and read the active provider's current settings directly**

```ts
// apps/desktop/src/main/providers/runtime.ts
export interface ActiveLLMSelection {
  providerId: string
  model: string
}

export function getProviderSettingsForId(
  store: StoreLike,
  providerId: string
): Record<string, unknown> | undefined {
  return getNormalizedProviderSettings(store).providerSettings[providerId]
}

export function getActiveLLMSelection(store: StoreLike): ActiveLLMSelection | undefined {
  const settings = getNormalizedProviderSettings(store)
  const providerId = settings.activeProviders.llm
  const model =
    providerId && typeof settings.providerSettings[providerId]?.model === 'string'
      ? settings.providerSettings[providerId]?.model?.trim()
      : ''

  if (!providerId || !model) {
    return undefined
  }

  return { providerId, model }
}

export async function resolveActiveASRSelection(
  deps: ASRProviderRuntimeDeps
): Promise<{ provider: ASRProvider; settings: Record<string, unknown> }> {
  const providerId = getActiveASRProviderId(deps.store)
  if (!providerId) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active ASR provider before processing a recording.'
    )
  }

  const providers = getProviderRecords(deps.store)
  const providerRecord = providers[providerId]
  if (!providerRecord?.enabled) {
    throw new ConfigurationError(providerId, 'Provider is not configured')
  }

  return {
    provider: deps.asrRegistry.resolve(providerId, providerRecord.config ?? {}),
    settings: getProviderSettingsForId(deps.store, providerId) ?? {}
  }
}
```

```ts
// apps/desktop/src/main/post-recording-pipeline.ts
const { provider: asrProvider, settings: asrSettings } = await this.deps.resolveActiveASRSelection()
const savedLanguage =
  typeof asrSettings.language === 'string' && asrSettings.language.trim().length > 0
    ? asrSettings.language
    : 'en'
const asrRequest = { language: savedLanguage }
```

- [ ] **Step 4: Run the runtime and pipeline tests to verify active-provider settings drive behavior**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the runtime integration**

```bash
git add apps/desktop/src/main/providers/runtime.ts apps/desktop/src/main/index.ts apps/desktop/src/main/post-recording-pipeline.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
git commit -m "refactor: resolve runtime config from provider settings"
```

### Task 7: Run Full Regression And Remove Dead References

**Files:**
- Modify: `apps/desktop/src/main/__tests__/providers-router.test.ts`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
- Modify: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Modify: `docs/superpowers/specs/2026-04-02-llm-provider-model-selection-design.md`
- Modify: `docs/superpowers/specs/2026-04-03-openrouter-provider-design.md`

- [ ] **Step 1: Write the final regression checklist directly into the touched tests and docs**

```md
## Superseded By 2026-04-06 Provider-Defined Settings

This document's persistence model is partially superseded by `docs/superpowers/specs/2026-04-06-provider-defined-settings-design.md`.

Use:

```ts
{
  providers: {},
  providerSettings: {},
  activeProviders: {}
}
```

Do not introduce new code that depends on `providerModels` or `activeModels`.
```

- [ ] **Step 2: Run the focused regression suite that covers the new contract end-to-end**

Run:

```bash
pnpm vitest run packages/providers/src/llm/__tests__/registry.test.ts packages/providers/src/asr/__tests__/registry.test.ts packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/oauth-service.test.ts apps/desktop/src/main/__tests__/providers-router.test.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run the package-level safety checks**

Run:

```bash
pnpm --filter @openbroca/providers typecheck
pnpm vitest run
```

Expected:

- `pnpm --filter @openbroca/providers typecheck` exits `0`
- `pnpm vitest run` exits `0`

- [ ] **Step 4: Commit the cleanup and spec backreferences**

```bash
git add apps/desktop/src/main/__tests__/providers-router.test.ts apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx apps/desktop/src/main/__tests__/provider-runtime.test.ts docs/superpowers/specs/2026-04-02-llm-provider-model-selection-design.md docs/superpowers/specs/2026-04-03-openrouter-provider-design.md
git commit -m "test: cover provider-defined settings end to end"
```
