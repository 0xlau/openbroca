# OpenRouter Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent `openrouter` LLM provider backed by `@openrouter/sdk`, then wire it through desktop registration, model selection, activation, and runtime resolution.

**Architecture:** Create a new provider under `packages/providers/src/llm/providers/openrouter` that implements the shared `LLMProvider` contract without importing anything from the `openai` provider directory. Keep desktop integration on existing abstractions: descriptor export, registry registration, TRPC model listing, persisted provider settings, and active LLM runtime resolution.

**Tech Stack:** TypeScript, Vitest, Electron, React, TRPC, Zustand, `@openrouter/sdk`

---

## File Structure

### New Files

- `packages/providers/src/llm/providers/openrouter/index.ts`
  Owns the OpenRouter descriptor, config schema, and connection metadata.
- `packages/providers/src/llm/providers/openrouter/provider.ts`
  Owns the independent OpenRouter SDK-backed implementation of `LLMProvider`.
- `packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts`
  Verifies descriptor metadata, schema, and connection fields.
- `packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts`
  Verifies model listing, generate, complete, and error behavior with a mocked SDK.

### Existing Files To Modify

- `packages/providers/package.json`
  Adds the `@openrouter/sdk` dependency and `./llm/openrouter` export.
- `apps/desktop/src/main/providers/index.ts`
  Registers the new descriptor in the live desktop LLM registry.
- `apps/desktop/src/main/__tests__/providers-router.test.ts`
  Verifies model listing works for a manually configured OpenRouter provider.
- `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
  Verifies runtime config resolution and active LLM selection work for OpenRouter.
- `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
  Adds `openrouter` to the dropdown-model provider whitelist.
- `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
  Verifies OpenRouter renders in the Providers page and uses dropdown-based model selection.

## Task 1: Add Package Wiring and Descriptor

**Files:**
- Modify: `packages/providers/package.json`
- Create: `packages/providers/src/llm/providers/openrouter/index.ts`
- Create: `packages/providers/src/llm/providers/openrouter/provider.ts`
- Create: `packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts`

- [ ] **Step 1: Write the failing descriptor test**

Create `packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openrouterDescriptor } from '../index.ts'

describe('openrouterDescriptor', () => {
  it('registers a distinct openrouter provider with api key connection metadata', () => {
    expect(openrouterDescriptor.id).toBe('openrouter')
    expect(openrouterDescriptor.displayName).toBe('OpenRouter')
    expect(openrouterDescriptor.connectionOptions).toEqual([
      expect.objectContaining({
        type: 'apiKey',
        fields: [expect.objectContaining({ key: 'apiKey' })]
      })
    ])
  })

  it('declares expected llm capabilities', () => {
    expect(openrouterDescriptor.capabilities).toEqual({
      streaming: true,
      nonStreaming: true,
      functionCalling: true,
      vision: true,
      jsonMode: true
    })
  })

  it('accepts a minimal api key config and creates an openrouter provider', () => {
    const config = openrouterDescriptor.configSchema.parse({ apiKey: 'or-key' })
    const provider = openrouterDescriptor.create(config)

    expect(config).toEqual({ apiKey: 'or-key' })
    expect(provider.id).toBe('openrouter')
    expect(provider.displayName).toBe('OpenRouter')
    expect(provider.isConfigured()).toBe(true)
  })

  it('rejects an empty api key', () => {
    expect(() => openrouterDescriptor.configSchema.parse({ apiKey: '' })).toThrow()
  })
})
```

- [ ] **Step 2: Run the descriptor test and verify it fails**

Run:

```bash
pnpm vitest run packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts
```

Expected: FAIL because the `openrouter` provider files do not exist yet.

- [ ] **Step 3: Add the package export, dependency, and descriptor**

Update `packages/providers/package.json`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./llm": "./src/llm/index.ts",
    "./asr": "./src/asr/index.ts",
    "./llm/openai": "./src/llm/providers/openai/index.ts",
    "./llm/openai-codex": "./src/llm/providers/openai-codex/index.ts",
    "./llm/openrouter": "./src/llm/providers/openrouter/index.ts",
    "./asr/deepgram": "./src/asr/providers/deepgram/index.ts",
    "./asr/sherpa-onnx": "./src/asr/providers/sherpa-onnx/index.ts",
    "./icons": "./src/shared/icons/index.ts"
  },
  "dependencies": {
    "@deepgram/sdk": "^3.12.0",
    "@openrouter/sdk": "^0.11.2",
    "openai": "^4.103.0",
    "sherpa-onnx-node": "^1.12.0",
    "zod": "^4.3.6"
  }
}
```

Create `packages/providers/src/llm/providers/openrouter/index.ts`:

```ts
import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { OpenRouterLLMProvider, type OpenRouterConfig } from './provider.ts'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API key is required')
})

export const openrouterDescriptor: LLMProviderDescriptor<OpenRouterConfig> = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Route LLM requests through OpenRouter with your account-scoped model access.',
  configSchema,
  capabilities: {
    streaming: true,
    nonStreaming: true,
    functionCalling: true,
    vision: true,
    jsonMode: true
  },
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      description: 'Enter an OpenRouter API key to enable OpenRouter models in OpenBroca.',
      fields: [
        {
          key: 'apiKey',
          label: 'API Key',
          input: 'password',
          required: true,
          description: 'Your OpenRouter API key.'
        }
      ]
    }
  ],
  create: (config) => new OpenRouterLLMProvider(config)
}

export { OpenRouterLLMProvider, type OpenRouterConfig } from './provider.ts'
```

Create a minimal `packages/providers/src/llm/providers/openrouter/provider.ts` stub so the descriptor test can pass independently:

```ts
import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '../../contracts.ts'

export interface OpenRouterConfig {
  apiKey: string
}

export class OpenRouterLLMProvider implements LLMProvider {
  readonly id = 'openrouter'
  readonly displayName = 'OpenRouter'

  constructor(private readonly config: OpenRouterConfig) {}

  isConfigured(): boolean {
    return this.config.apiKey.trim().length > 0
  }

  async listModels(_signal?: AbortSignal): Promise<LLMModel[]> {
    throw new ConfigurationError(this.id, 'Provider methods are not implemented yet')
  }

  async generate(_request: CompletionRequest): Promise<CompletionResult> {
    throw new ConfigurationError(this.id, 'Provider methods are not implemented yet')
  }

  async *complete(_request: CompletionRequest): AsyncIterable<CompletionChunk> {
    throw new ConfigurationError(this.id, 'Provider methods are not implemented yet')
  }
}
```

Install the dependency:

```bash
pnpm --filter @openbroca/providers add @openrouter/sdk
```

- [ ] **Step 4: Run the descriptor test**

Run:

```bash
pnpm vitest run packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts
```

Expected: the descriptor test passes with the new descriptor and minimal provider stub.

- [ ] **Step 5: Commit the package wiring**

Run:

```bash
git add packages/providers/package.json packages/providers/src/llm/providers/openrouter/index.ts packages/providers/src/llm/providers/openrouter/provider.ts packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts
git commit -m "feat(providers): add openrouter descriptor"
```

## Task 2: Implement the Independent OpenRouter Provider

**Files:**
- Modify: `packages/providers/src/llm/providers/openrouter/provider.ts`
- Create: `packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts`

- [ ] **Step 1: Write the failing provider tests**

Create `packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError } from '../../../../shared/errors.ts'
import { OpenRouterLLMProvider } from '../provider.ts'

const listForUserMock = vi.fn()
const chatSendMock = vi.fn()

vi.mock('@openrouter/sdk', () => ({
  default: vi.fn(class MockOpenRouter {
    models = {
      listForUser: listForUserMock
    }
    chat = {
      send: chatSendMock
    }
  })
}))

describe('OpenRouterLLMProvider', () => {
  beforeEach(() => {
    listForUserMock.mockReset()
    chatSendMock.mockReset()
  })

  it('listModels maps the user-filtered model list into stable LLM models', async () => {
    listForUserMock.mockResolvedValue({
      data: [
        { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', context_length: 128000 },
        { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', context_length: 200000 }
      ]
    })

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })

    await expect(provider.listModels()).resolves.toEqual([
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
      { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', contextWindow: 128000 }
    ])
  })

  it('generate maps a non-streaming completion result', async () => {
    chatSendMock.mockResolvedValue({
      choices: [
        {
          message: { content: 'clean transcript' },
          finish_reason: 'length'
        }
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18
      }
    })

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })

    await expect(
      provider.generate({
        model: 'openai/gpt-4.1-mini',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.2,
        maxTokens: 123
      })
    ).resolves.toEqual({
      content: 'clean transcript',
      finishReason: 'length',
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18
      }
    })
  })

  it('complete yields streaming deltas and a terminal chunk', async () => {
    async function* stream() {
      yield {
        choices: [{ delta: { content: 'hello' }, finish_reason: null }]
      }
      yield {
        choices: [{ delta: { content: '' }, finish_reason: 'stop' }]
      }
    }

    chatSendMock.mockResolvedValue(stream())

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    const chunks = []

    for await (const chunk of provider.complete({
      model: 'openai/gpt-4.1-mini',
      messages: [{ role: 'user', content: 'stream' }]
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'hello', finishReason: null },
      { delta: '', finishReason: 'stop' }
    ])
  })

  it('throws ConfigurationError when used without an api key', async () => {
    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    Reflect.set(provider as object, 'client', null)

    await expect(provider.listModels()).rejects.toBeInstanceOf(ConfigurationError)
    await expect(
      provider.generate({
        model: 'openai/gpt-4.1-mini',
        messages: [{ role: 'user', content: 'hi' }]
      })
    ).rejects.toBeInstanceOf(ConfigurationError)
  })

  it('preserves sdk request failures', async () => {
    listForUserMock.mockRejectedValue(new Error('OpenRouter upstream failed'))
    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })

    await expect(provider.listModels()).rejects.toThrow('OpenRouter upstream failed')
  })
})
```

- [ ] **Step 2: Run the provider test and verify it fails**

Run:

```bash
pnpm vitest run packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts
```

Expected: FAIL because the provider stub from Task 1 does not implement the runtime methods yet.

- [ ] **Step 3: Implement the provider without importing from `openai`**

Replace the stub in `packages/providers/src/llm/providers/openrouter/provider.ts` with:

```ts
import OpenRouter from '@openrouter/sdk'
import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  LLMModel,
  LLMProvider
} from '../../contracts.ts'

export interface OpenRouterConfig {
  apiKey: string
}

function normalizeFinishReason(reason: string | null | undefined): CompletionChunk['finishReason'] {
  return reason === 'length' ? 'length' : reason === 'stop' ? 'stop' : null
}

export class OpenRouterLLMProvider implements LLMProvider {
  readonly id = 'openrouter'
  readonly displayName = 'OpenRouter'

  private client: OpenRouter | null = null
  private readonly apiKey: string

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey
    this.client = new OpenRouter({
      apiKey: config.apiKey
    })
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  async listModels(_signal?: AbortSignal): Promise<LLMModel[]> {
    const { client, apiKey } = this.assertClient()
    const response = await client.models.listForUser({ bearer: apiKey })

    return (response.data ?? [])
      .map((model) => ({
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.context_length
      }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
  }

  async generate(request: CompletionRequest): Promise<CompletionResult> {
    const { client } = this.assertClient()
    const response = await client.chat.send({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false
    }, { signal: request.signal })

    const choice = response.choices[0]
    return {
      content: typeof choice?.message?.content === 'string' ? choice.message.content : '',
      finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
          }
        : undefined
    }
  }

  async *complete(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const { client } = this.assertClient()
    const stream = await client.chat.send({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true
    }, { signal: request.signal })

    for await (const chunk of stream) {
      if ('error' in chunk) {
        throw new Error(chunk.error.message)
      }

      const choice = chunk.choices?.[0]
      if (!choice) continue

      const delta = choice.delta?.content ?? ''
      const finishReason = normalizeFinishReason(choice.finish_reason)

      if (delta || finishReason) {
        yield { delta, finishReason }
      }
    }
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.listModels()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }

  private assertClient(): { client: OpenRouter; apiKey: string } {
    if (!this.client || !this.apiKey.trim()) {
      throw new ConfigurationError(this.id, 'Provider is not configured')
    }

    return {
      client: this.client,
      apiKey: this.apiKey
    }
  }
}
```

- [ ] **Step 4: Run the package tests and verify they pass**

Run:

```bash
pnpm vitest run packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts
pnpm --filter @openbroca/providers test
pnpm --filter @openbroca/providers typecheck
```

Expected: the OpenRouter provider tests pass, all package tests pass, and package typecheck succeeds.

- [ ] **Step 5: Commit the provider implementation**

Run:

```bash
git add packages/providers/src/llm/providers/openrouter
git commit -m "feat(providers): implement openrouter llm provider"
```

## Task 3: Wire Desktop Main-Process Registration and Runtime

**Files:**
- Modify: `apps/desktop/src/main/providers/index.ts`
- Modify: `apps/desktop/src/main/__tests__/providers-router.test.ts`
- Modify: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`

- [ ] **Step 1: Write the failing main-process tests**

Add this test to `apps/desktop/src/main/__tests__/providers-router.test.ts`:

```ts
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'

test('listModels resolves openrouter from manual provider settings in main', async () => {
  const llmRegistry = new LLMProviderRegistry()
  llmRegistry.register(openrouterDescriptor)

  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      openrouter: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'or-key' }
      }
    },
    providerModels: {},
    activeProviders: {},
    activeModels: {}
  })

  const caller = providersRouter.createCaller({
    store,
    llmRegistry,
    asrRegistry: new ASRProviderRegistry(),
    oauthService: new OAuthService({
      secureStorage: {
        setSecret: vi.fn(async () => undefined),
        getSecret: vi.fn(async () => null),
        deleteSecret: vi.fn(async () => undefined)
      },
      store,
      providers: {}
    })
  } as unknown as Context)

  const models = await caller.listModels({ providerId: 'openrouter' })
  expect(models[0]?.id).toBeTruthy()
})
```

Add this test to `apps/desktop/src/main/__tests__/provider-runtime.test.ts`:

```ts
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'

test('resolves active openrouter provider and model from manual config', async () => {
  const store = new MemoryStore()
  store.set('providers', {
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

  const llmRegistry = new LLMProviderRegistry()
  llmRegistry.register(openrouterDescriptor)
  const oauthService = new OAuthService({
    secureStorage: {
      setSecret: vi.fn(async () => undefined),
      getSecret: vi.fn(async () => null),
      deleteSecret: vi.fn(async () => undefined)
    },
    store,
    providers: {}
  })

  const selection = await resolveActiveLLMSelection({
    llmRegistry,
    oauthService,
    store
  })

  expect(selection.provider.id).toBe('openrouter')
  expect(selection.model).toBe('openai/gpt-4.1-mini')
})
```

- [ ] **Step 2: Run the main-process tests and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts -t "openrouter"
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts -t "openrouter"
```

Expected: FAIL because the desktop main process does not yet import or register the OpenRouter descriptor.

- [ ] **Step 3: Register the live desktop provider and stabilize the tests**

Update `apps/desktop/src/main/providers/index.ts`:

```ts
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

llmRegistry.register(openaiDescriptor)
llmRegistry.register(openaiCodexDescriptor)
llmRegistry.register(openrouterDescriptor)
asrRegistry.register(deepgramDescriptor)
asrRegistry.register(sherpaOnnxDescriptor)
```

In both tests, mock the SDK before importing the provider:

```ts
const listForUserMock = vi.fn().mockResolvedValue({
  data: [{ id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', context_length: 128000 }]
})
const chatCreateMock = vi.fn()

vi.mock('@openrouter/sdk', () => ({
  default: vi.fn(class MockOpenRouter {
    models = { listForUser: listForUserMock }
    chat = { completions: { create: chatCreateMock } }
  })
}))
```

Keep `providersRouter` and `providers/runtime.ts` unchanged unless type errors reveal a contract mismatch. The goal here is integration through existing abstractions, not new OpenRouter-specific branches.

- [ ] **Step 4: Run the targeted main-process tests and the broader desktop main suite**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: both files pass, including the new OpenRouter coverage.

- [ ] **Step 5: Commit the desktop main-process integration**

Run:

```bash
git add apps/desktop/src/main/providers/index.ts apps/desktop/src/main/__tests__/providers-router.test.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts
git commit -m "feat(desktop): register openrouter provider"
```

## Task 4: Enable OpenRouter in the Providers Page Model-Selection Flow

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write the failing renderer test**

Add this fixture and test to `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`:

```ts
const openRouterProviderFixture: ProviderFixture = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Route models through OpenRouter',
  icon: null,
  connectionOptions: [
    {
      type: 'apiKey',
      label: 'API Key',
      fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
    }
  ]
}

test('opens OpenRouter model settings with dropdown-backed model choices', async () => {
  llmProviders = [openRouterProviderFixture]
  llmModelsByProvider = {
    openrouter: [
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
      { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini' }
    ]
  }
  providerStore.setState({
    data: {
      providers: {
        openrouter: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'or-key' }
        }
      },
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    },
    isHydrated: true,
    update: vi.fn().mockResolvedValue(undefined),
    replace: vi.fn().mockResolvedValue(undefined),
    hydrate: vi.fn().mockResolvedValue(undefined)
  })

  const { Providers } = await import('../providers')
  render(<Providers />)

  fireEvent.click(screen.getByRole('button', { name: /open model settings for openrouter/i }))

  expect(screen.getByRole('combobox')).toBeTruthy()
  expect(screen.queryByLabelText('Model name')).toBeNull()
})
```

- [ ] **Step 2: Run the renderer test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx -t "OpenRouter model settings"
```

Expected: FAIL because `getLLMModelInputMode()` still treats `openrouter` as a manual-entry provider.

- [ ] **Step 3: Add OpenRouter to the dropdown whitelist**

Update `apps/desktop/src/renderer/src/components/providers/provider-types.ts`:

```ts
const dropdownProviderIds = new Set(['openai', 'openai-codex', 'openrouter'])
```

Do not add any provider-specific UI branches elsewhere. The model settings dialog already uses `getLLMModelInputMode()` as the only source of truth.

- [ ] **Step 4: Run the renderer providers suite**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: the page-level Providers tests pass, including the new OpenRouter dropdown-selection scenario.

- [ ] **Step 5: Commit the renderer integration**

Run:

```bash
git add apps/desktop/src/renderer/src/components/providers/provider-types.ts apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat(renderer): enable openrouter model selection"
```

## Task 5: Final Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the focused provider and desktop integration tests**

Run:

```bash
pnpm vitest run \
  packages/providers/src/llm/providers/openrouter/__tests__/descriptor.test.ts \
  packages/providers/src/llm/providers/openrouter/__tests__/provider.test.ts \
  apps/desktop/src/main/__tests__/providers-router.test.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts \
  apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS across all new OpenRouter coverage.

- [ ] **Step 2: Run package and app typechecks that exercise the changed areas**

Run:

```bash
pnpm --filter @openbroca/providers typecheck
pnpm --filter desktop typecheck
```

Expected: PASS with no TypeScript errors from the new provider, desktop registry wiring, or renderer model-selection path.

- [ ] **Step 3: Inspect the final diff before handoff**

Run:

```bash
git status --short
git diff -- packages/providers apps/desktop
```

Expected: only the planned OpenRouter files and tests are changed.

- [ ] **Step 4: Commit the verification checkpoint if needed**

Run:

```bash
git add packages/providers apps/desktop
git commit -m "test: verify openrouter provider integration"
```

Use this only if verification required follow-up edits. If the previous task commits are sufficient and verification produced no code changes, skip this commit.
