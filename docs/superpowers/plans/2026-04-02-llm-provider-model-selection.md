# LLM Provider Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-level LLM model configuration plus explicit active-model activation so the desktop app only runs an LLM provider after the user has chosen a model and clicked `Set as active`.

**Architecture:** Extend the shared persisted provider settings shape with `providerModels` and `activeModels`, then wire renderer UI and main-process runtime to the same source of truth. Keep connection, saved-model configuration, and activation as separate concerns so the providers page can prepare multiple providers without silently switching the live pipeline.

**Tech Stack:** Electron, React, TRPC, Zustand, Vitest, Testing Library, TypeScript

---

## File Structure

### Existing Files To Modify

- `apps/desktop/src/shared/provider-auth.ts`
  Owns the persisted provider settings schema, normalization, and provider-cleanup helpers shared by renderer and main.
- `apps/desktop/src/renderer/src/stores/provider-store.ts`
  Owns the persisted renderer wrapper around provider settings and nested update behavior.
- `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`
  Verifies hydration, normalization, nested updates, and store writes.
- `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
  Owns provider UI helper functions and is the best place to centralize LLM model input-mode rules.
- `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
  Renders each provider row and will gain the settings icon, model copy, and activation gating.
- `apps/desktop/src/renderer/src/components/providers/provider-section.tsx`
  Passes section-specific row props and will need to forward active-model information only for LLM rows.
- `apps/desktop/src/renderer/src/pages/main/providers.tsx`
  Coordinates provider queries, dialog state, settings saves, activation, and disconnect cleanup.
- `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
  Covers page-level behaviors including connect, disconnect, activation, and the new model settings flow.
- `apps/desktop/src/main/providers/runtime.ts`
  Owns active provider/model resolution and should stop defaulting to the first LLM model.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Builds the LLM request and should consume the saved active model instead of calling `listModels()`.
- `apps/desktop/src/main/index.ts`
  Wires `PostRecordingPipeline` dependencies and will stop passing `selectFirstLLMModel`.
- `apps/desktop/src/main/auth/oauth-service.ts`
  Removes provider records on OAuth disconnect and must also clear saved model state and active model state.
- `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
  Covers active runtime selection and configuration errors.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Covers the LLM request built by the pipeline and should prove the configured active model is used.
- `apps/desktop/src/main/__tests__/oauth-service.test.ts`
  Covers disconnect cleanup and should protect the new settings fields.

### New Files To Create

- `apps/desktop/src/renderer/src/components/providers/provider-model-settings-dialog.tsx`
  Dedicated dialog for configuring the saved model for a connected LLM provider.

---

### Task 1: Expand Shared Provider Settings Schema

**Files:**
- Modify: `apps/desktop/src/shared/provider-auth.ts`
- Test: `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`
- Test: `apps/desktop/src/main/__tests__/oauth-service.test.ts`

- [ ] **Step 1: Write the failing store normalization test for the new settings shape**

Add a test to `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts` proving hydration backfills `providerModels` and `activeModels`:

```ts
test('preserves structured settings and backfills missing model state as empty objects', async () => {
  storeGetQueryMock.mockResolvedValueOnce({
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
  storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

  const { providerStore } = await import('../provider-store')
  await providerStore.getState().hydrate()

  expect(providerStore.getState().data).toEqual({
    providers: {
      openai: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'token' }
      }
    },
    providerModels: {},
    activeProviders: {
      llm: 'openai'
    },
    activeModels: {}
  })
})
```

- [ ] **Step 2: Run the targeted store test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts -t "backfills missing model state"
```

Expected: FAIL because `ProviderSettings` currently has no `providerModels` or `activeModels`.

- [ ] **Step 3: Write the failing cleanup test for disconnecting an active provider**

Add a test to `apps/desktop/src/main/__tests__/oauth-service.test.ts` proving OAuth disconnect removes saved model and active model state:

```ts
test('disconnect clears active llm model and saved provider model for the removed provider', async () => {
  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'openai-codex': {
        enabled: true,
        connectionType: 'oauth',
        account: { accountId: 'acct_codex' },
        auth: {
          status: 'connected',
          lastConnectedAt: '2026-04-02T00:00:00.000Z'
        }
      }
    },
    providerModels: {
      'openai-codex': { model: 'gpt-5.2-codex' }
    },
    activeProviders: {
      llm: 'openai-codex'
    },
    activeModels: {
      llm: 'gpt-5.2-codex'
    }
  })

  await service.disconnect('openai-codex')

  expect(store.get('providers')).toEqual({
    providers: {},
    providerModels: {},
    activeProviders: {},
    activeModels: {}
  })
})
```

- [ ] **Step 4: Run the targeted OAuth-service test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/oauth-service.test.ts -t "disconnect clears active llm model"
```

Expected: FAIL because disconnect cleanup only knows about `activeProviders`.

- [ ] **Step 5: Implement the shared settings shape and cleanup helpers**

Update `apps/desktop/src/shared/provider-auth.ts` so the shared schema includes provider-level and active model state:

```ts
export interface ActiveModels {
  llm?: string
}

export interface ProviderModelSelection {
  model: string
}

export interface ProviderSettings {
  providers: Record<string, ProviderConnectionRecord | undefined>
  providerModels: Record<string, ProviderModelSelection | undefined>
  activeProviders: ActiveProviders
  activeModels: ActiveModels
}

export const defaultProviderSettings: ProviderSettings = {
  providers: {},
  providerModels: {},
  activeProviders: {},
  activeModels: {}
}
```

Add a shared cleanup helper that removes both activation and provider-model state when a provider is removed:

```ts
export function removeProviderState(
  settings: ProviderSettings,
  providerId: string
): ProviderSettings {
  const nextProviders = { ...settings.providers }
  delete nextProviders[providerId]

  const nextProviderModels = { ...settings.providerModels }
  delete nextProviderModels[providerId]

  const nextActiveProviders = clearActiveProviderSelections(settings.activeProviders, providerId)
  const nextActiveModels: ActiveModels =
    nextActiveProviders.llm === settings.activeProviders.llm ? { ...settings.activeModels } : {}

  if (!nextActiveProviders.llm) {
    delete nextActiveModels.llm
  }

  return {
    providers: nextProviders,
    providerModels: nextProviderModels,
    activeProviders: nextActiveProviders,
    activeModels: nextActiveModels
  }
}
```

Normalize the new fields in `normalizeProviderSettings()`:

```ts
const providerModels = isRecord(raw.providerModels)
  ? ({ ...raw.providerModels } as Record<string, ProviderModelSelection | undefined>)
  : {}

const rawActiveModels = isRecord(raw.activeModels)
  ? (raw.activeModels as ActiveModels)
  : {}

const activeModels: ActiveModels = {}
if (activeProviders.llm && typeof rawActiveModels.llm === 'string' && rawActiveModels.llm.trim()) {
  activeModels.llm = rawActiveModels.llm
}
```

- [ ] **Step 6: Run the two targeted tests and verify they pass**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts -t "backfills missing model state"
pnpm vitest run apps/desktop/src/main/__tests__/oauth-service.test.ts -t "disconnect clears active llm model"
```

Expected: PASS for both tests.

- [ ] **Step 7: Commit the schema change**

Run:

```bash
git add apps/desktop/src/shared/provider-auth.ts \
  apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts \
  apps/desktop/src/main/__tests__/oauth-service.test.ts
git commit -m "feat(providers): add persisted llm model settings"
```

---

### Task 2: Update Renderer Store Merge and Removal Behavior

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/provider-store.ts`
- Test: `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`

- [ ] **Step 1: Write the failing nested-merge test for `providerModels` and `activeModels`**

Add a test to `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`:

```ts
test('update performs nested merge for providerModels and activeModels', async () => {
  const { providerStore } = await import('../provider-store')

  await providerStore.getState().replace({
    providers: {
      openai: {
        enabled: true,
        connectionType: 'apiKey',
        config: { apiKey: 'token' }
      }
    },
    providerModels: {
      openai: { model: 'gpt-4.1' }
    },
    activeProviders: {
      llm: 'openai'
    },
    activeModels: {
      llm: 'gpt-4.1'
    }
  })

  await providerStore.getState().update({
    providerModels: {
      'openai-codex': { model: 'gpt-5.2-codex' }
    }
  })

  expect(providerStore.getState().data.providerModels).toEqual({
    openai: { model: 'gpt-4.1' },
    'openai-codex': { model: 'gpt-5.2-codex' }
  })
})
```

- [ ] **Step 2: Run the targeted renderer-store test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts -t "nested merge for providerModels and activeModels"
```

Expected: FAIL because `updateProviderSettingsSafely()` only merges `providers` and `activeProviders`.

- [ ] **Step 3: Implement nested merge and removal logic in the store wrapper**

Update `apps/desktop/src/renderer/src/stores/provider-store.ts`:

```ts
async function updateProviderSettingsSafely(partial: Partial<ProviderSettings>): Promise<void> {
  const current = providerStoreBase.getState().data
  const next = normalizeProviderSettings({
    providers: {
      ...current.providers,
      ...(partial.providers ?? {})
    },
    providerModels: {
      ...current.providerModels,
      ...(partial.providerModels ?? {})
    },
    activeProviders: {
      ...current.activeProviders,
      ...(partial.activeProviders ?? {})
    },
    activeModels: {
      ...current.activeModels,
      ...(partial.activeModels ?? {})
    }
  })

  await providerStoreBase.getState().replace(next)
}
```

Update `removeProviderConnection()` so it delegates to the shared cleanup helper instead of manually rewriting only two fields:

```ts
export async function removeProviderConnection(providerId: string): Promise<void> {
  const current = providerStore.getState().data
  await providerStore.getState().replace(removeProviderState(current, providerId))
}
```

- [ ] **Step 4: Run the full provider-store test file and verify it passes**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the renderer-store changes**

Run:

```bash
git add apps/desktop/src/renderer/src/stores/provider-store.ts \
  apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts
git commit -m "feat(providers): merge llm model state in provider store"
```

---

### Task 3: Add LLM Model Settings UI and Activation Gating

**Files:**
- Create: `apps/desktop/src/renderer/src/components/providers/provider-model-settings-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-section.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write the failing page test for disabled activation before a model is chosen**

Add a test to `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`:

```ts
test('disables Set as active for connected llm providers without a saved model', async () => {
  llmProviders = [
    {
      id: 'openai',
      displayName: 'OpenAI',
      description: 'GPT models',
      icon: null,
      connectionOptions: [
        {
          type: 'apiKey',
          label: 'API Key',
          fields: [{ key: 'apiKey', label: 'API Key', input: 'password', required: true }]
        }
      ]
    }
  ]

  providerStore.setState({
    ...providerStore.getState(),
    data: {
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'sk-openai' }
        }
      },
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    }
  })

  await renderProviders()

  expect(screen.getByRole('button', { name: 'Set as active' })).toBeDisabled()
  expect(screen.getByText('Choose a model first')).toBeTruthy()
})
```

- [ ] **Step 2: Write the failing page test for dropdown-provider model selection**

Extend the TRPC mock in the same test file so `providers.listModels.useQuery` can return models by provider id, then add:

```ts
test('saves a dropdown-selected model for openai without auto-activating it', async () => {
  llmProviders = [openAIProviderFixture]
  llmModelsByProvider.openai = [
    { id: 'gpt-4.1', name: 'gpt-4.1' },
    { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' }
  ]

  const updateSettings = vi.fn().mockResolvedValue(undefined)
  providerStore.setState({
    ...providerStore.getState(),
    data: {
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'sk-openai' }
        }
      },
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    },
    update: updateSettings
  })

  await renderProviders()
  fireEvent.click(screen.getByRole('button', { name: 'Open model settings for OpenAI' }))
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByText('gpt-4.1'))
  fireEvent.click(screen.getByRole('button', { name: 'Save model' }))

  await waitFor(() => {
    expect(updateSettings).toHaveBeenCalledWith({
      providerModels: {
        openai: { model: 'gpt-4.1' }
      }
    })
  })
})
```

- [ ] **Step 3: Write the failing page test for manual-entry providers**

Add:

```ts
test('saves a manually entered model for a custom llm provider', async () => {
  llmProviders = [customProviderFixture]
  const updateSettings = vi.fn().mockResolvedValue(undefined)

  providerStore.setState({
    ...providerStore.getState(),
    data: {
      providers: {
        custom: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'custom-token' }
        }
      },
      providerModels: {},
      activeProviders: {},
      activeModels: {}
    },
    update: updateSettings
  })

  await renderProviders()
  fireEvent.click(screen.getByRole('button', { name: 'Open model settings for Custom LLM' }))
  fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'my-model-v1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save model' }))

  await waitFor(() => {
    expect(updateSettings).toHaveBeenCalledWith({
      providerModels: {
        custom: { model: 'my-model-v1' }
      }
    })
  })
})
```

- [ ] **Step 4: Run the three targeted page tests and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx \
  -t "disables Set as active for connected llm providers without a saved model|saves a dropdown-selected model for openai without auto-activating it|saves a manually entered model for a custom llm provider"
```

Expected: FAIL because the row has no settings icon, no saved-model state, and no model dialog.

- [ ] **Step 5: Add provider-model UI helpers**

Update `apps/desktop/src/renderer/src/components/providers/provider-types.ts` with a centralized input-mode helper:

```ts
export type LLMModelInputMode = 'select' | 'manual'

const dropdownProviderIds = new Set(['openai', 'openai-codex'])

export function getLLMModelInputMode(providerId: string): LLMModelInputMode {
  return dropdownProviderIds.has(providerId) ? 'select' : 'manual'
}
```

Add a small formatter for row copy:

```ts
export function getLLMModelSummary(savedModel?: string, activeModel?: string): string[] {
  if (!savedModel && !activeModel) {
    return []
  }

  if (savedModel && activeModel && savedModel !== activeModel) {
    return [`Active model: ${activeModel}`, `Saved model: ${savedModel}`]
  }

  return [`${activeModel ? 'Active model' : 'Saved model'}: ${activeModel ?? savedModel}`]
}
```

- [ ] **Step 6: Create the model settings dialog component**

Create `apps/desktop/src/renderer/src/components/providers/provider-model-settings-dialog.tsx` with a dedicated dialog that supports both input modes:

```tsx
export function ProviderModelSettingsDialog({
  provider,
  open,
  savedModel,
  onOpenChange,
  onSave
}: {
  provider: ProviderViewModel | null
  open: boolean
  savedModel?: string
  onOpenChange: (next: boolean) => void
  onSave: (providerId: string, model: string) => Promise<void>
}) {
  const mode = provider ? getLLMModelInputMode(provider.id) : 'manual'
  const [manualModel, setManualModel] = React.useState(savedModel ?? '')
  const { data: models, isLoading, error } = trpc.providers.listModels.useQuery(
    { providerId: provider?.id ?? '' },
    { enabled: open && !!provider && mode === 'select' }
  )

  // save either the selected model id or the trimmed manual text
}
```

Render:

- `Select` + `SelectTrigger` + `SelectItem` when `mode === 'select'`
- `Input` labeled `Model name` when `mode === 'manual'`
- a `Save model` button disabled when the form is incomplete

- [ ] **Step 7: Wire the new dialog and row behavior into the providers page**

Update `apps/desktop/src/renderer/src/pages/main/providers.tsx` to hold the selected LLM provider for the model dialog:

```tsx
const [selectedModelProvider, setSelectedModelProvider] = React.useState<ProviderViewModel | null>(null)
const [isModelDialogOpen, setIsModelDialogOpen] = React.useState(false)

async function handleSaveModelSelection(providerId: string, model: string) {
  await providerStore.getState().update({
    providerModels: {
      [providerId]: { model }
    }
  })
}

async function handleSetActive(section: 'llm' | 'asr', providerId: string) {
  if (section === 'llm') {
    const model = providerStore.getState().data.providerModels[providerId]?.model
    if (!model) {
      return
    }

    await providerStore.getState().update({
      activeProviders: { llm: providerId },
      activeModels: { llm: model }
    })
    return
  }

  await providerStore.getState().update({
    activeProviders: { asr: providerId }
  })
}
```

Pass the new props through `ProviderSection` and `ProviderRow`:

```tsx
savedModel={settings.providerModels[provider.id]?.model}
activeModel={section === 'llm' && activeProviderId === provider.id ? settings.activeModels.llm : undefined}
onOpenModelSettings={handleOpenModelSettings}
```

Update `apps/desktop/src/renderer/src/components/providers/provider-row.tsx` so the row:

- renders a Hugeicons settings button with `aria-label="Open model settings for ${provider.displayName}"`
- disables `Set as active` when `provider` is an LLM row with no `savedModel`
- shows `Choose a model first` helper copy
- shows model summary lines returned by `getLLMModelSummary()`

- [ ] **Step 8: Run the full page test file and verify it passes**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit the renderer UI changes**

Run:

```bash
git add apps/desktop/src/renderer/src/components/providers/provider-model-settings-dialog.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-types.ts \
  apps/desktop/src/renderer/src/components/providers/provider-row.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-section.tsx \
  apps/desktop/src/renderer/src/pages/main/providers.tsx \
  apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat(providers): add llm model settings dialog"
```

---

### Task 4: Resolve the Active LLM Model in Main-Process Runtime

**Files:**
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Modify: `apps/desktop/src/main/auth/oauth-service.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Test: `apps/desktop/src/main/__tests__/oauth-service.test.ts`

- [ ] **Step 1: Write the failing runtime test for reading the active LLM model**

Add to `apps/desktop/src/main/__tests__/provider-runtime.test.ts`:

```ts
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
    providerModels: {
      openai: { model: 'gpt-4.1' }
    },
    activeProviders: {
      llm: 'openai'
    },
    activeModels: {
      llm: 'gpt-4.1'
    }
  })

  expect(getActiveLLMModel(store)).toBe('gpt-4.1')
})
```

- [ ] **Step 2: Write the failing runtime test for missing active-model configuration**

Add:

```ts
test('throws a clear configuration error when an active llm provider has no active model', async () => {
  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'openai-codex': {
        enabled: true,
        connectionType: 'oauth'
      }
    },
    providerModels: {
      'openai-codex': { model: 'gpt-5.2-codex' }
    },
    activeProviders: {
      llm: 'openai-codex'
    },
    activeModels: {}
  })

  await expect(resolveActiveLLMModel({ store })).rejects.toThrowError(
    '[provider:not-configured] Select an active LLM provider and model before requesting runtime access.'
  )
})
```

- [ ] **Step 3: Run the targeted runtime tests and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts \
  -t "reads the active llm model from structured provider settings|throws a clear configuration error when an active llm provider has no active model"
```

Expected: FAIL because `getActiveLLMModel` and `resolveActiveLLMModel` do not exist.

- [ ] **Step 4: Implement active-model runtime helpers and cleanup**

Update `apps/desktop/src/main/providers/runtime.ts`:

```ts
export function getActiveLLMModel(store: StoreLike): string | undefined {
  return normalizeProviderSettings(store.get<unknown>('providers')).activeModels.llm
}

export async function resolveActiveLLMModel({ store }: { store: StoreLike }): Promise<string> {
  const model = getActiveLLMModel(store)
  if (!model) {
    throw new ConfigurationError(
      'provider:not-configured',
      'Select an active LLM provider and model before requesting runtime access.'
    )
  }
  return model
}
```

Update `apps/desktop/src/main/auth/oauth-service.ts` so both `disconnect()` and `clearProviderRecord()` use `removeProviderState()` instead of hand-editing only `providers` and `activeProviders`.

- [ ] **Step 5: Run the full runtime and OAuth-service tests and verify they pass**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts
pnpm vitest run apps/desktop/src/main/__tests__/oauth-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the main-process resolution changes**

Run:

```bash
git add apps/desktop/src/main/providers/runtime.ts \
  apps/desktop/src/main/auth/oauth-service.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts \
  apps/desktop/src/main/__tests__/oauth-service.test.ts
git commit -m "feat(providers): resolve active llm model in runtime"
```

---

### Task 5: Use the Active Model in the Post-Recording Pipeline

**Files:**
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Write the failing pipeline test that proves the configured active model is used**

Add to `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`:

```ts
test('uses the resolved active llm model instead of the first listed provider model', async () => {
  const llmProvider = {
    id: 'openai',
    displayName: 'OpenAI',
    listModels: vi.fn().mockResolvedValue([
      { id: 'gpt-first', name: 'gpt-first' }
    ]),
    generate: vi.fn().mockResolvedValue({
      content: 'clean transcript',
      finishReason: 'stop',
      usage: undefined
    })
  }

  const pipeline = new PostRecordingPipeline({
    historyRepository,
    recordingStorage,
    resolveActiveASRProvider: async () => asrProvider,
    resolveActiveLLMProvider: async () => llmProvider as never,
    resolveActiveLLMModel: async () => 'gpt-4.1'
  })

  await pipeline.process(recording)

  expect(llmProvider.generate).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'gpt-4.1' })
  )
  expect(llmProvider.listModels).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the targeted pipeline test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts \
  -t "uses the resolved active llm model instead of the first listed provider model"
```

Expected: FAIL because `PostRecordingPipeline` currently depends on `selectLLMModel`.

- [ ] **Step 3: Replace `selectFirstLLMModel` injection with active-model resolution**

Update `apps/desktop/src/main/post-recording-pipeline.ts`:

```ts
private readonly resolveActiveLLMModel: () => Promise<string>

constructor(
  private readonly deps: {
    historyRepository: HistoryRepository
    recordingStorage: RecordingStorage
    resolveActiveASRProvider: () => Promise<ASRProvider>
    resolveActiveLLMProvider: () => Promise<LLMProvider>
    resolveActiveLLMModel: () => Promise<string>
  }
) {
  this.resolveActiveLLMModel = deps.resolveActiveLLMModel
}
```

Replace model selection in `process()`:

```ts
llmModel = await this.resolveActiveLLMModel()
llmRequest = {
  model: llmModel,
  messages: [...]
}
```

Update `apps/desktop/src/main/index.ts` to wire the new dependency:

```ts
const postRecordingPipeline = new PostRecordingPipeline({
  historyRepository,
  recordingStorage,
  resolveActiveASRProvider: () => resolveActiveASRProvider({ asrRegistry, store }),
  resolveActiveLLMProvider: () => resolveActiveLLMProvider({ llmRegistry, oauthService, store }),
  resolveActiveLLMModel: () => resolveActiveLLMModel({ store })
})
```

- [ ] **Step 4: Run the full pipeline test file and verify it passes**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the pipeline wiring change**

Run:

```bash
git add apps/desktop/src/main/post-recording-pipeline.ts \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
git commit -m "feat(providers): use active llm model in pipeline"
```

---

### Task 6: Run Final Verification

**Files:**
- Modify: none
- Test: `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Test: `apps/desktop/src/main/__tests__/oauth-service.test.ts`
- Test: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Run the full provider-related verification suite**

Run:

```bash
pnpm vitest run \
  apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts \
  apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts \
  apps/desktop/src/main/__tests__/oauth-service.test.ts \
  apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected: PASS with all provider-related tests green.

- [ ] **Step 2: Run the desktop typecheck**

Run:

```bash
pnpm --filter desktop typecheck
```

Expected: PASS.

- [ ] **Step 3: Record the final state in git**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 4: Confirm the branch is ready for review**

Run:

```bash
git log --oneline -5
```

Expected: recent commits include the schema, renderer UI, runtime, and pipeline changes from Tasks 1 through 5.

---

## Self-Review

### Spec Coverage

- Saved model state is covered in Task 1 and Task 2.
- Settings icon, dropdown/manual modes, activation gating, and row copy are covered in Task 3.
- Runtime active-model enforcement is covered in Task 4.
- Pipeline consumption of the active model is covered in Task 5.
- Required regressions and verification are covered in Task 6.

### Placeholder Scan

- No `TODO`, `TBD`, or "implement later" markers remain.
- Every task includes exact file paths, concrete code snippets, and exact commands.

### Type Consistency

- Persisted shape uses `providerModels` and `activeModels` consistently across shared, renderer, and main tasks.
- Runtime helper names are consistent: `getActiveLLMModel()` and `resolveActiveLLMModel()`.
- UI terminology is consistent: `saved model` for provider-level configuration and `active model` for the live runtime selection.
