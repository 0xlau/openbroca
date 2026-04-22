# Local ASR Model Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared local ASR model-management flow so local ASR providers can connect via download or existing directory, persist a provider-level `modelDir`, persist a runtime `selectedModelId`, and let users switch models later from settings, with `sherpa-onnx` as the first concrete implementation.

**Architecture:** Extend the ASR provider contract with provider-owned local-model lifecycle methods and typed local-model settings, then implement the real sherpa install/scan/runtime path around `selectedModelId`. Add main-process local-model orchestration and tRPC endpoints, then replace the current generic local connect/settings UX with a shared local-ASR flow that uses those APIs and only allows activation when the selected model is installed and ready.

**Tech Stack:** TypeScript, Zod, Electron main/renderer split, tRPC, Zustand, React, Vitest, Node filesystem/network APIs

---

### Task 1: Extend The Shared ASR Contract For Local Model Lifecycle

**Files:**
- Modify: `packages/providers/src/asr/contracts.ts`
- Modify: `packages/providers/src/asr/index.ts`
- Modify: `packages/providers/src/shared/settings.ts`
- Modify: `packages/providers/src/index.ts`
- Test: `packages/providers/src/asr/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing ASR registry test for provider-owned local model lifecycle metadata**

```ts
it('preserves local model lifecycle metadata on local ASR descriptors', () => {
  const registry = new ASRProviderRegistry()
  registry.register({
    id: 'mock-local-asr',
    displayName: 'Mock Local ASR',
    description: 'Mock local provider',
    kind: 'local',
    configSchema: z.object({
      modelDir: z.string()
    }),
    settingsSchema: z.object({
      selectedModelId: z.string().optional()
    }),
    settingsItems: [
      {
        key: 'selectedModelId',
        type: 'select',
        label: 'Current model',
        options: []
      }
    ],
    create: () => ({
      id: 'mock-local-asr',
      displayName: 'Mock Local ASR',
      isConfigured: () => true,
      recognize: async () => ({ text: '', segments: [] }),
      listCatalogModels: async () => [],
      scanInstalledModels: async () => [],
      installModel: async function* () {},
      removeInstalledModel: async () => undefined,
      resolveModelRuntime: async () => ({ modelId: 'mock-model', modelPath: '/tmp/mock' })
    })
  })

  const descriptor = registry.listDescriptors()[0]

  expect(descriptor.settingsItems?.[0]).toMatchObject({
    key: 'selectedModelId',
    type: 'select'
  })
})
```

- [ ] **Step 2: Run the focused provider registry test to prove the new lifecycle methods are missing**

Run:

```bash
pnpm vitest run packages/providers/src/asr/__tests__/registry.test.ts
```

Expected: FAIL with type errors because `listCatalogModels`, `scanInstalledModels`, `installModel`, `removeInstalledModel`, and `resolveModelRuntime` are not part of `LocalASRProvider`.

- [ ] **Step 3: Extend the ASR contract, shared exports, and local settings type surface**

```ts
// packages/providers/src/asr/contracts.ts
export interface LocalCatalogModel {
  id: string
  name: string
  sizeBytes: number
  downloadUrl?: string
}

export interface InstalledLocalModel {
  id: string
  name: string
  path: string
  sizeBytes?: number
}

export interface LocalModelRuntime {
  modelId: string
  modelPath: string
}

export interface LocalModelInstallProgress {
  modelId: string
  progress: number
  downloadedBytes: number
  totalBytes: number
  phase: 'downloading' | 'extracting' | 'validating' | 'finalizing'
}

export interface LocalASRProvider extends ASRProvider {
  listCatalogModels(): Promise<LocalCatalogModel[]>
  scanInstalledModels(modelDir: string): Promise<InstalledLocalModel[]>
  installModel(
    modelId: string,
    modelDir: string,
    signal?: AbortSignal
  ): AsyncIterable<LocalModelInstallProgress>
  removeInstalledModel(modelId: string, modelDir: string): Promise<void>
  resolveModelRuntime(modelDir: string, selectedModelId: string): Promise<LocalModelRuntime>
}
```

```ts
// packages/providers/src/shared/settings.ts
export interface ProviderLocalModelSelectSettingsItem extends ProviderSettingsItemBase {
  type: 'local-model-select'
}

export type ProviderSettingsItem =
  | ProviderTextSettingsItem
  | ProviderPasswordSettingsItem
  | ProviderToggleSettingsItem
  | ProviderSelectSettingsItem
  | ProviderModelSelectSettingsItem
  | ProviderLocalModelSelectSettingsItem
```

```ts
// packages/providers/src/index.ts
export {
  type ProviderLocalModelSelectSettingsItem
} from './shared/settings.ts'
```

```ts
// packages/providers/src/asr/index.ts
export {
  type InstalledLocalModel,
  type LocalCatalogModel,
  type LocalModelInstallProgress,
  type LocalModelRuntime,
  type LocalASRProvider
} from './contracts.ts'
```

- [ ] **Step 4: Run the focused provider registry test to verify the contract compiles**

Run:

```bash
pnpm vitest run packages/providers/src/asr/__tests__/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the shared ASR contract changes**

```bash
git add packages/providers/src/asr/contracts.ts packages/providers/src/asr/index.ts packages/providers/src/shared/settings.ts packages/providers/src/index.ts packages/providers/src/asr/__tests__/registry.test.ts
git commit -m "refactor: add local asr model lifecycle contract"
```

### Task 2: Persist `selectedModelId` Without Breaking Existing LLM Settings

**Files:**
- Modify: `apps/desktop/src/shared/provider-auth.ts`
- Modify: `apps/desktop/src/renderer/src/stores/provider-store.ts`
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Test: `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`

- [ ] **Step 1: Write the failing store/runtime tests for local ASR `selectedModelId`**

```ts
test('normalizes selectedModelId for local ASR provider settings', async () => {
  const normalized = normalizeProviderSettings({
    providers: {
      'sherpa-onnx': {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: '/tmp/sherpa'
        }
      }
    },
    providerSettings: {
      'sherpa-onnx': {
        selectedModelId: '  paraformer-zh  '
      }
    }
  })

  expect(normalized.providerSettings['sherpa-onnx']).toEqual({
    selectedModelId: 'paraformer-zh'
  })
})
```

```ts
test('resolveActiveASRSelection returns selectedModelId from providerSettings', async () => {
  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'sherpa-onnx': {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: '/tmp/sherpa'
        }
      }
    },
    providerSettings: {
      'sherpa-onnx': {
        selectedModelId: 'paraformer-zh'
      }
    },
    activeProviders: {
      asr: 'sherpa-onnx'
    }
  })

  const asrRegistry = {
    listDescriptors: vi.fn(() => [
      {
        id: 'sherpa-onnx',
        settingsSchema: z.object({
          selectedModelId: z.string()
        })
      }
    ]),
    resolve: vi.fn(() => ({ id: 'sherpa-onnx', displayName: 'Sherpa', isConfigured: () => true }))
  }

  const selection = await resolveActiveASRSelection({ asrRegistry, store } as never)

  expect(selection.settings).toEqual({
    selectedModelId: 'paraformer-zh'
  })
})
```

- [ ] **Step 2: Run the focused store/runtime tests to capture the normalization gap**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: FAIL because `normalizeProviderSettings()` only trims `model` and the ASR runtime tests do not yet preserve `selectedModelId`.

- [ ] **Step 3: Extend normalization helpers and runtime settings parsing for local ASR**

```ts
// apps/desktop/src/shared/provider-auth.ts
function normalizeSelectedModelId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const modelId = value.trim()
  return modelId ? modelId : null
}

if (Object.prototype.hasOwnProperty.call(nextSettings, 'selectedModelId')) {
  const selectedModelId = normalizeSelectedModelId(nextSettings.selectedModelId)
  if (selectedModelId) {
    nextSettings.selectedModelId = selectedModelId
  } else {
    delete nextSettings.selectedModelId
  }
}
```

```ts
// apps/desktop/src/main/providers/runtime.ts
function normalizeSelectedModelId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function getActiveASRSelectedModelId(store: StoreLike): string | undefined {
  const settings = getNormalizedProviderSettings(store)
  const providerId = settings.activeProviders.asr
  const providerSettings = providerId ? settings.providerSettings[providerId] : undefined
  return providerSettings ? normalizeSelectedModelId(providerSettings.selectedModelId) : undefined
}
```

- [ ] **Step 4: Run the focused store/runtime tests again**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the persistence update**

```bash
git add apps/desktop/src/shared/provider-auth.ts apps/desktop/src/renderer/src/stores/provider-store.ts apps/desktop/src/main/providers/runtime.ts apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts
git commit -m "refactor: persist local asr selected model ids"
```

### Task 3: Make Sherpa Install Real And Runtime Resolution Strict

**Files:**
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`
- Test: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
- Test: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts`

- [ ] **Step 1: Write the failing sherpa tests for catalog, install, and selected runtime resolution**

```ts
it('lists sherpa catalog models separately from installed models', async () => {
  const provider = makeProvider()

  await expect(provider.listCatalogModels()).resolves.toEqual([
    expect.objectContaining({ id: 'zipformer-en-small' }),
    expect.objectContaining({ id: 'paraformer-zh' })
  ])
})
```

```ts
it('resolveModelRuntime requires the selected model instead of choosing the first installed model', async () => {
  const provider = makeProvider()
  existsSyncMock.mockImplementation((target) => {
    if (typeof target === 'string' && target.includes('sherpa-onnx-streaming-paraformer-bilingual-zh-en')) {
      return true
    }
    return false
  })

  await expect(provider.resolveModelRuntime('/models', 'paraformer-zh')).resolves.toEqual(
    expect.objectContaining({
      modelId: 'paraformer-zh'
    })
  )

  await expect(provider.resolveModelRuntime('/models', 'zipformer-en-small')).rejects.toThrow(
    /selected model is not installed/i
  )
})
```

```ts
it('installModel writes a validated final model directory instead of leaving only an archive', async () => {
  const provider = makeProvider()
  const progress: Array<string> = []

  for await (const event of provider.installModel('paraformer-zh', '/models')) {
    progress.push(event.phase)
  }

  expect(progress).toEqual(
    expect.arrayContaining(['downloading', 'extracting', 'validating', 'finalizing'])
  )
  expect(fs.mkdirSync).toHaveBeenCalledWith(
    expect.stringContaining('sherpa-onnx-streaming-paraformer-bilingual-zh-en'),
    expect.objectContaining({ recursive: true })
  )
})
```

- [ ] **Step 2: Run the sherpa provider tests to capture the missing lifecycle behavior**

Run:

```bash
pnpm vitest run packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts
```

Expected: FAIL because sherpa only exposes `listModels()`, `downloadModel()`, and first-found runtime selection.

- [ ] **Step 3: Replace the sherpa lifecycle implementation with catalog, scan, install, and selected-model runtime resolution**

```ts
// packages/providers/src/asr/providers/sherpa-onnx/provider.ts
export interface SherpaOnnxConfig {
  modelDir: string
}

export class SherpaOnnxASRProvider implements LocalASRProvider, StreamingASRProvider {
  async listCatalogModels(): Promise<LocalCatalogModel[]> {
    return MODEL_MANIFEST.map((entry) => ({
      id: entry.id,
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      downloadUrl: entry.downloadUrl
    }))
  }

  async scanInstalledModels(modelDir: string): Promise<InstalledLocalModel[]> {
    return MODEL_MANIFEST
      .map((entry) => ({
        entry,
        modelPath: path.join(modelDir, entry.subDir)
      }))
      .filter(({ entry, modelPath }) => fs.existsSync(modelPath) && hasRequiredFiles(entry.id, modelPath))
      .map(({ entry, modelPath }) => ({
        id: entry.id,
        name: entry.name,
        path: modelPath,
        sizeBytes: entry.sizeBytes
      }))
  }

  async *installModel(
    modelId: string,
    modelDir: string,
    signal?: AbortSignal
  ): AsyncIterable<LocalModelInstallProgress> {
    const entry = getManifestEntry(modelId)
    const archivePath = path.join(modelDir, `${modelId}.tmp.tar.bz2`)
    const stagingPath = path.join(modelDir, `${entry.subDir}.staging`)
    const finalPath = path.join(modelDir, entry.subDir)

    fs.mkdirSync(modelDir, { recursive: true })
    yield* downloadArchive(entry.downloadUrl, archivePath, modelId, signal)
    yield { modelId, phase: 'extracting', progress: 1, downloadedBytes: 0, totalBytes: 0 }
    extractTarBz2(archivePath, modelDir, stagingPath)
    yield { modelId, phase: 'validating', progress: 1, downloadedBytes: 0, totalBytes: 0 }
    assertModelLayout(modelId, stagingPath)
    yield { modelId, phase: 'finalizing', progress: 1, downloadedBytes: 0, totalBytes: 0 }
    fs.rmSync(finalPath, { recursive: true, force: true })
    fs.renameSync(stagingPath, finalPath)
    fs.rmSync(archivePath, { force: true })
  }

  async resolveModelRuntime(modelDir: string, selectedModelId: string): Promise<LocalModelRuntime> {
    const entry = getManifestEntry(selectedModelId)
    const modelPath = path.join(modelDir, entry.subDir)
    if (!fs.existsSync(modelPath) || !hasRequiredFiles(selectedModelId, modelPath)) {
      throw new ConfigurationError(this.id, 'The selected model is not installed')
    }
    return {
      modelId: selectedModelId,
      modelPath
    }
  }
}

function getManifestEntry(modelId: string) {
  const entry = MODEL_MANIFEST.find((candidate) => candidate.id === modelId)
  if (!entry) {
    throw new TranscriptionError('sherpa-onnx', `Unknown model: ${modelId}`)
  }
  return entry
}

function hasRequiredFiles(modelId: string, modelPath: string): boolean {
  const required =
    modelId === 'paraformer-zh'
      ? ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt']
      : ['encoder-epoch-99-avg-1.onnx', 'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.onnx', 'tokens.txt']

  return required.every((fileName) => fs.existsSync(path.join(modelPath, fileName)))
}

async function* downloadArchive(
  url: string,
  archivePath: string,
  modelId: string,
  signal?: AbortSignal
): AsyncIterable<LocalModelInstallProgress> {
  for await (const progress of downloadWithProgress('sherpa-onnx', modelId, url, path.dirname(archivePath), signal)) {
    yield {
      ...progress,
      phase: 'downloading'
    }
  }
}

function extractTarBz2(archivePath: string, modelDir: string, stagingPath: string): void {
  fs.rmSync(stagingPath, { recursive: true, force: true })
  fs.mkdirSync(modelDir, { recursive: true })
  execFileSync('tar', ['-xjf', archivePath, '-C', modelDir])
}

function assertModelLayout(modelId: string, modelPath: string): void {
  if (!hasRequiredFiles(modelId, modelPath)) {
    throw new TranscriptionError('sherpa-onnx', 'Installed model files are incomplete')
  }
}
```

```ts
// packages/providers/src/asr/providers/sherpa-onnx/index.ts
const settingsSchema = z.object({
  selectedModelId: z.string().trim().min(1, 'A model must be selected')
})

settingsItems: [
  {
    key: 'selectedModelId',
    type: 'local-model-select',
    label: 'Current model',
    description: 'Switch to another installed local model or install one from the catalog.'
  }
]
```

- [ ] **Step 4: Run the sherpa provider tests again**

Run:

```bash
pnpm vitest run packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the sherpa provider rewrite**

```bash
git add packages/providers/src/asr/providers/sherpa-onnx/index.ts packages/providers/src/asr/providers/sherpa-onnx/provider.ts packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts
git commit -m "feat: add sherpa local model lifecycle"
```

### Task 4: Add Main-Process Local Model Orchestration And Router APIs

**Files:**
- Create: `apps/desktop/src/main/providers/local-models.ts`
- Create: `apps/desktop/src/main/providers/local-model-tasks.ts`
- Modify: `apps/desktop/src/main/trpc/routers/providers.ts`
- Modify: `apps/desktop/src/main/trpc/context.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/src/main/__tests__/providers-router.test.ts`

- [ ] **Step 1: Write the failing router tests for reading state, installing, selecting, and changing the directory**

```ts
test('getLocalModelState returns catalog, installed models, and selected model for a local ASR provider', async () => {
  const provider = {
    id: 'sherpa-onnx',
    displayName: 'Sherpa',
    isConfigured: () => true,
    recognize: async () => ({ text: '', segments: [] }),
    listCatalogModels: vi.fn(async () => [{ id: 'paraformer-zh', name: 'Paraformer Chinese', sizeBytes: 1 }]),
    scanInstalledModels: vi.fn(async () => [{ id: 'paraformer-zh', name: 'Paraformer Chinese', path: '/tmp/models/paraformer-zh' }]),
    installModel: vi.fn(async function* () {}),
    removeInstalledModel: vi.fn(async () => undefined),
    resolveModelRuntime: vi.fn(async () => ({ modelId: 'paraformer-zh', modelPath: '/tmp/models/paraformer-zh' }))
  }

  const asrRegistry = new ASRProviderRegistry()
  asrRegistry.register({
    id: 'sherpa-onnx',
    displayName: 'Sherpa',
    description: 'Local ASR',
    kind: 'local',
    configSchema: z.object({ modelDir: z.string() }),
    settingsSchema: z.object({ selectedModelId: z.string().optional() }),
    create: () => provider
  })

  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'sherpa-onnx': {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: '/tmp/models'
        }
      }
    },
    providerSettings: {
      'sherpa-onnx': {
        selectedModelId: 'paraformer-zh'
      }
    },
    activeProviders: {}
  })

  const caller = providersRouter.createCaller({ store, asrRegistry } as unknown as Context)
  const state = await caller.getLocalModelState({ providerId: 'sherpa-onnx' })

  expect(state.selectedModelId).toBe('paraformer-zh')
  expect(state.catalogModels).toHaveLength(1)
  expect(state.installedModels).toHaveLength(1)
})
```

```ts
test('selectLocalModel updates providerSettings.selectedModelId', async () => {
  const asrRegistry = new ASRProviderRegistry()
  asrRegistry.register({
    id: 'sherpa-onnx',
    displayName: 'Sherpa',
    description: 'Local ASR',
    kind: 'local',
    configSchema: z.object({ modelDir: z.string() }),
    settingsSchema: z.object({ selectedModelId: z.string().optional() }),
    create: () => ({
      id: 'sherpa-onnx',
      displayName: 'Sherpa',
      isConfigured: () => true,
      recognize: async () => ({ text: '', segments: [] }),
      listCatalogModels: async () => [],
      scanInstalledModels: async () => [{ id: 'paraformer-zh', name: 'Paraformer Chinese', path: '/tmp/models/paraformer-zh' }],
      installModel: async function* () {},
      removeInstalledModel: async () => undefined,
      resolveModelRuntime: async () => ({ modelId: 'paraformer-zh', modelPath: '/tmp/models/paraformer-zh' })
    })
  })

  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'sherpa-onnx': {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: '/tmp/models'
        }
      }
    },
    providerSettings: {},
    activeProviders: {}
  })

  const caller = providersRouter.createCaller({ store, asrRegistry } as unknown as Context)
  await caller.selectLocalModel({
    providerId: 'sherpa-onnx',
    modelDir: '/tmp/models',
    modelId: 'paraformer-zh'
  })

  expect(store.get('providers')).toMatchObject({
    providerSettings: {
      'sherpa-onnx': {
        selectedModelId: 'paraformer-zh'
      }
    }
  })
})
```

- [ ] **Step 2: Run the focused main-process router tests to show the new APIs do not exist**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: FAIL because `providersRouter` has no local-model procedures and no install-task orchestration.

- [ ] **Step 3: Add a main-process local model service and new router procedures**

```ts
// apps/desktop/src/main/providers/local-model-tasks.ts
export interface LocalModelInstallTaskState {
  taskId: string
  providerId: string
  modelId: string
  modelDir: string
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: number
  downloadedBytes: number
  totalBytes: number
  message?: string
}

export class LocalModelTaskManager {
  private readonly tasks = new Map<string, LocalModelInstallTaskState>()
  private readonly controllers = new Map<string, AbortController>()

  get(providerId: string, modelDir: string): LocalModelInstallTaskState | undefined {
    return this.tasks.get(`${providerId}:${modelDir}`)
  }

  track(
    providerId: string,
    modelDir: string,
    progress: LocalModelInstallProgress
  ): LocalModelInstallTaskState {
    const key = `${providerId}:${modelDir}`
    const nextState: LocalModelInstallTaskState = {
      taskId: key,
      providerId,
      modelId: progress.modelId,
      modelDir,
      status: 'running',
      progress: progress.progress,
      downloadedBytes: progress.downloadedBytes,
      totalBytes: progress.totalBytes
    }
    this.tasks.set(key, nextState)
    return nextState
  }
}
```

```ts
// apps/desktop/src/main/providers/local-models.ts
export interface MutableStoreLike {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
}

export async function getLocalModelState({
  asrRegistry,
  providerId,
  store
}: {
  asrRegistry: ASRProviderRegistry
  providerId: string
  store: MutableStoreLike
}) {
  const settings = getNormalizedProviderSettings(store)
  const providerRecord = settings.providers[providerId]
  const modelDir = providerRecord?.connectionType === 'local' ? providerRecord.config?.modelDir : undefined
  const provider = asrRegistry.resolve(providerId, providerRecord?.config ?? {})

  if (!asrRegistry.isLocal(provider) || !modelDir) {
    return {
      modelDir,
      selectedModelId: undefined,
      catalogModels: [],
      installedModels: []
    }
  }

  return {
    modelDir,
    selectedModelId: settings.providerSettings[providerId]?.selectedModelId,
    catalogModels: await provider.listCatalogModels(),
    installedModels: await provider.scanInstalledModels(modelDir)
  }
}
```

```ts
// apps/desktop/src/main/providers/local-models.ts
export async function updateProviderStateAfterModelSelection(
  store: MutableStoreLike,
  input: {
    providerId: string
    modelDir: string
    modelId: string
  }
) {
  const current = getNormalizedProviderSettings(store)
  store.set('providers', normalizeProviderSettings({
    ...current,
    providers: {
      ...current.providers,
      [input.providerId]: {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: input.modelDir
        }
      }
    },
    providerSettings: {
      ...current.providerSettings,
      [input.providerId]: {
        ...(current.providerSettings[input.providerId] ?? {}),
        selectedModelId: input.modelId
      }
    }
  }))
}
```

```ts
// apps/desktop/src/main/providers/local-models.ts
export async function installLocalModelAndSelect(input: {
  asrRegistry: ASRProviderRegistry
  store: MutableStoreLike
  tasks: LocalModelTaskManager
  providerId: string
  modelDir: string
  modelId: string
}) {
  const providerRecord = getNormalizedProviderSettings(input.store).providers[input.providerId]
  const provider = input.asrRegistry.resolve(input.providerId, {
    ...(providerRecord?.config ?? {}),
    modelDir: input.modelDir
  })

  if (!input.asrRegistry.isLocal(provider)) {
    throw new ConfigurationError(input.providerId, 'Provider does not support local model installs')
  }

  for await (const _progress of provider.installModel(input.modelId, input.modelDir)) {
    input.tasks.track(input.providerId, input.modelDir, _progress)
  }

  await updateProviderStateAfterModelSelection(input.store, {
    providerId: input.providerId,
    modelDir: input.modelDir,
    modelId: input.modelId
  })

  return getLocalModelState({
    asrRegistry: input.asrRegistry,
    providerId: input.providerId,
    store: input.store
  })
}
```

```ts
// apps/desktop/src/main/trpc/context.ts
import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { AudioCaptureSource } from '@openbroca/audio-capture'
import type { ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProviderRegistry } from '@openbroca/providers/llm'
import type { OAuthService } from '../auth/oauth-service'
import type { HistoryRepository } from '../history-repository'
import type { AppIdentityService } from '../app-identity/service'
import type { StoreSchema } from '../store'
import type { LocalModelTaskManager } from '../providers/local-model-tasks'

export interface Context {
  window: BrowserWindow
  store: Store<StoreSchema>
  llmRegistry: LLMProviderRegistry
  asrRegistry: ASRProviderRegistry
  captureSource: AudioCaptureSource
  oauthService: OAuthService
  historyRepository: HistoryRepository
  appIdentityService: AppIdentityService
  localModelTasks: LocalModelTaskManager
}

export function createContext(
  window: BrowserWindow,
  store: Store<StoreSchema>,
  llmRegistry: LLMProviderRegistry,
  asrRegistry: ASRProviderRegistry,
  captureSource: AudioCaptureSource,
  oauthService: OAuthService,
  historyRepository: HistoryRepository,
  appIdentityService: AppIdentityService,
  localModelTasks: LocalModelTaskManager
): Context {
  return {
    window,
    store,
    llmRegistry,
    asrRegistry,
    captureSource,
    oauthService,
    historyRepository,
    appIdentityService,
    localModelTasks
  }
}
```

```ts
// apps/desktop/src/main/trpc/routers/providers.ts
getLocalModelState: publicProcedure
  .input(z.object({ providerId: z.string() }))
  .query(({ ctx, input }) =>
    getLocalModelState({
      asrRegistry: ctx.asrRegistry,
      providerId: input.providerId,
      store: ctx.store
    })
  ),

selectLocalModel: publicProcedure
  .input(
    z.object({
      providerId: z.string(),
      modelDir: z.string(),
      modelId: z.string()
    })
  )
  .mutation(async ({ ctx, input }) => {
    await updateProviderStateAfterModelSelection(ctx.store, input)
    return getLocalModelState({
      asrRegistry: ctx.asrRegistry,
      providerId: input.providerId,
      store: ctx.store
    })
  }),

installLocalModel: publicProcedure
  .input(
    z.object({
      providerId: z.string(),
      modelDir: z.string(),
      modelId: z.string()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const nextState = await installLocalModelAndSelect({
      asrRegistry: ctx.asrRegistry,
      store: ctx.store,
      tasks: ctx.localModelTasks,
      ...input
    })
    return nextState
  })
```

- [ ] **Step 4: Run the router tests again**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the main-process local model service**

```bash
git add apps/desktop/src/main/providers/local-models.ts apps/desktop/src/main/providers/local-model-tasks.ts apps/desktop/src/main/trpc/routers/providers.ts apps/desktop/src/main/trpc/context.ts apps/desktop/src/main/index.ts apps/desktop/src/main/__tests__/providers-router.test.ts
git commit -m "feat: add local asr model management apis"
```

### Task 5: Enforce Runtime Readiness, Setup Status, And ASR Instance Eviction

**Files:**
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Modify: `apps/desktop/src/main/providers/setup-status.ts`
- Modify: `packages/providers/src/asr/registry.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Test: `apps/desktop/src/main/__tests__/providers-router.test.ts`

- [ ] **Step 1: Write the failing runtime/setup-status tests for selected-model enforcement and instance eviction**

```ts
test('resolveActiveASRSelection throws when selectedModelId is missing for a local ASR provider', async () => {
  const asrRegistry = new ASRProviderRegistry()
  asrRegistry.register({
    id: 'sherpa-onnx',
    displayName: 'Sherpa',
    description: 'Local ASR',
    kind: 'local',
    configSchema: z.object({ modelDir: z.string() }),
    settingsSchema: z.object({ selectedModelId: z.string().optional() }),
    create: () => ({
      id: 'sherpa-onnx',
      displayName: 'Sherpa',
      isConfigured: () => true,
      recognize: async () => ({ text: '', segments: [] }),
      listCatalogModels: async () => [],
      scanInstalledModels: async () => [],
      installModel: async function* () {},
      removeInstalledModel: async () => undefined,
      resolveModelRuntime: async () => ({ modelId: 'one', modelPath: '/tmp/one' })
    })
  })

  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'sherpa-onnx': {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: '/tmp/models'
        }
      }
    },
    providerSettings: {
      'sherpa-onnx': {}
    },
    activeProviders: {
      asr: 'sherpa-onnx'
    }
  })

  await expect(
    resolveActiveASRSelection({
      asrRegistry,
      store
    } as never)
  ).rejects.toThrow(/selected model/i)
})
```

```ts
test('evicts cached local ASR instances when modelDir or selectedModelId changes', async () => {
  const registry = new ASRProviderRegistry()
  const dispose = vi.fn(async () => undefined)

  registry.register({
    id: 'mock-local',
    displayName: 'Mock Local',
    description: 'Mock Local',
    kind: 'local',
    configSchema: z.object({ modelDir: z.string() }),
    create: () => ({
      id: 'mock-local',
      displayName: 'Mock Local',
      isConfigured: () => true,
      recognize: async () => ({ text: '', segments: [] }),
      listCatalogModels: async () => [],
      scanInstalledModels: async () => [],
      installModel: async function* () {},
      removeInstalledModel: async () => undefined,
      resolveModelRuntime: async () => ({ modelId: 'one', modelPath: '/tmp/one' }),
      dispose
    })
  })

  registry.resolve('mock-local', { modelDir: '/tmp/one' })
  await registry.evict('mock-local')

  expect(dispose).toHaveBeenCalledOnce()
  expect(registry.get('mock-local')).toBeUndefined()
})
```

- [ ] **Step 2: Run the focused runtime tests to confirm readiness and eviction are missing**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: FAIL because ASR runtime does not require `selectedModelId` and `ASRProviderRegistry` has no `evict()` helper.

- [ ] **Step 3: Add ASR eviction, runtime validation, and provider-aware local setup status**

```ts
// packages/providers/src/asr/registry.ts
async evict(id: string): Promise<void> {
  const provider = this.instances.get(id)
  if (!provider) {
    return
  }
  await provider.dispose?.()
  this.instances.delete(id)
}
```

```ts
// apps/desktop/src/main/providers/runtime.ts
export interface StoreLike {
  get<T>(key: string): T | undefined
  set?(key: string, value: unknown): void
}

export async function resolveActiveASRSelection(deps: ASRProviderRuntimeDeps): Promise<ActiveASRSelection> {
  const providerId = getActiveASRProviderId(deps.store)
  // existing provider record checks...
  const settings = resolveValidatedASRProviderSettings(deps, providerId)
  const selectedModelId =
    typeof settings.selectedModelId === 'string' && settings.selectedModelId.trim()
      ? settings.selectedModelId.trim()
      : undefined

  const provider = deps.asrRegistry.resolve(providerId, providerRecord.config ?? {})
  if (deps.asrRegistry.isLocal(provider) && !selectedModelId) {
    throw new ConfigurationError(providerId, 'Select a local ASR model before activating this provider.')
  }

  return {
    provider,
    settings
  }
}
```

```ts
// apps/desktop/src/main/providers/setup-status.ts
if (descriptor.kind === 'local' && connection?.connectionType === 'local') {
  const provider = deps.asrRegistry.resolve(providerId, connection.config ?? {})
  if (deps.asrRegistry.isLocal(provider)) {
    const modelDir = connection.config?.modelDir
    const selectedModelId = settings?.selectedModelId
    if (!modelDir) {
      return {
        status: 'not-connected',
        canActivate: false,
        blockingReasons: ['Choose a model directory first']
      }
    }
    if (typeof selectedModelId !== 'string' || selectedModelId.trim().length === 0) {
      return {
        status: 'configured',
        canActivate: false,
        blockingReasons: ['Choose or install a model first']
      }
    }
    const installed = await provider.scanInstalledModels(modelDir)
    if (!installed.some((model) => model.id === selectedModelId)) {
      return {
        status: 'invalid',
        canActivate: false,
        blockingReasons: ['The selected model is not installed in the current directory']
      }
    }
  }
}
```

- [ ] **Step 4: Run the runtime/setup-status tests again**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the readiness and eviction changes**

```bash
git add apps/desktop/src/main/providers/runtime.ts apps/desktop/src/main/providers/setup-status.ts packages/providers/src/asr/registry.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/providers-router.test.ts
git commit -m "feat: enforce local asr runtime readiness"
```

### Task 6: Replace The Current Local Connect Dialog With Download-Or-Directory Local ASR Flow

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write the failing renderer test for the local ASR connect flow**

```ts
test('local ASR connect defaults to download flow, installs a model, and saves modelDir plus selectedModelId', async () => {
  asrProviders = [
    {
      id: 'sherpa-onnx',
      displayName: '@k2-fsa/sherpa-onnx',
      description: 'Local ASR',
      icon: null,
      settingsItems: [
        {
          key: 'selectedModelId',
          type: 'local-model-select',
          label: 'Current model'
        }
      ],
      connectionOptions: [
        {
          type: 'local',
          label: 'Local model',
          fields: [{ key: 'modelDir', label: 'Model Directory', input: 'text', required: true }]
        }
      ]
    }
  ]

  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

  expect(screen.getByText('Download model')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Model Directory'), {
    target: { value: '/tmp/sherpa' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Download and use Paraformer Chinese' }))

  await waitFor(() =>
    expect(providerStore.getState().update).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: {
          'sherpa-onnx': expect.objectContaining({
            config: {
              modelDir: '/tmp/sherpa'
            }
          })
        },
        providerSettings: {
          'sherpa-onnx': {
            selectedModelId: 'paraformer-zh'
          }
        }
      })
    )
  )
})
```

- [ ] **Step 2: Run the renderer providers test suite to expose the missing local connect UI**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: FAIL because the connect dialog only renders generic connection fields and cannot manage local model downloads.

- [ ] **Step 3: Add a dedicated local-ASR connect state to the connect dialog and wire it to the new APIs**

```ts
// apps/desktop/src/renderer/src/components/providers/provider-types.ts
export function isLocalASRProvider(provider: ProviderViewModel): boolean {
  return 'kind' in provider && provider.kind === 'local'
}
```

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx
function LocalModelConnectPanel({
  provider,
  modelDir,
  onModelDirChange,
  onInstallAndUse,
  onScanExisting
}: {
  provider: ProviderViewModel
  modelDir: string
  onModelDirChange: (value: string) => void
  onInstallAndUse: (modelId: string) => Promise<void>
  onScanExisting: () => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <TypographySmall>Download model</TypographySmall>
      <Input value={modelDir} onChange={(event) => onModelDirChange(event.target.value)} />
      <Button type="button" onClick={() => void onInstallAndUse('paraformer-zh')}>
        Download and use Paraformer Chinese
      </Button>
      <Button type="button" variant="ghost" onClick={() => void onScanExisting()}>
        Use existing directory
      </Button>
    </div>
  )
}
```

```tsx
// apps/desktop/src/renderer/src/pages/main/providers.tsx
async function handleInstallLocalModel(providerId: string, modelDir: string, modelId: string) {
  const nextState = await trpcUtils.providers.installLocalModel.fetch({
    providerId,
    modelDir,
    modelId
  })
  await providerStore.getState().update({
    providers: {
      [providerId]: {
        enabled: true,
        connectionType: 'local',
        config: {
          modelDir: nextState.modelDir
        }
      }
    },
    providerSettings: {
      [providerId]: {
        selectedModelId: nextState.selectedModelId
      }
    }
  })
}
```

- [ ] **Step 4: Run the renderer providers test suite again**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit the local connect flow**

```bash
git add apps/desktop/src/renderer/src/components/providers/provider-types.ts apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx apps/desktop/src/renderer/src/pages/main/providers.tsx apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat: add local asr connect flow"
```

### Task 7: Rework Provider Settings For Local Model Switching, Directory Changes, And Deletion

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write the failing renderer tests for local model settings operations**

```ts
test('settings can switch to an installed local model and save selectedModelId', async () => {
  // seed provider store + local model query fixture
  fireEvent.click(screen.getByRole('button', { name: /open settings for @k2-fsa\/sherpa-onnx/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Use installed Zipformer English (Small)' }))

  await waitFor(() =>
    expect(providerStore.getState().update).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSettings: {
          'sherpa-onnx': {
            selectedModelId: 'zipformer-en-small'
          }
        }
      })
    )
  )
})
```

```ts
test('settings can change the model directory and force reselection when the old model is gone', async () => {
  fireEvent.click(screen.getByRole('button', { name: /open settings for @k2-fsa\/sherpa-onnx/i }))
  fireEvent.change(screen.getByLabelText('Model Directory'), {
    target: { value: '/tmp/empty-model-dir' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Rescan directory' }))

  await waitFor(() =>
    expect(providerStore.getState().update).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSettings: {
          'sherpa-onnx': {}
        }
      })
    )
  )
})
```

- [ ] **Step 2: Run the renderer providers test suite to expose the missing local settings behavior**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: FAIL because the settings dialog only knows generic select/text/model-select fields.

- [ ] **Step 3: Add a dedicated local-model settings panel and wire it to the new main-process APIs**

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx
type LocalModelStateViewModel = {
  modelDir?: string
  selectedModelId?: string
  catalogModels: Array<{ id: string; name: string }>
  installedModels: Array<{ id: string; name: string; path: string }>
}

function LocalModelSettingsPanel({
  providerId,
  modelState,
  onSelectInstalled,
  onInstallAndUse,
  onRemoveInstalled,
  onRescanDirectory
}: {
  providerId: string
  modelState: LocalModelStateViewModel
  onSelectInstalled: (modelId: string) => Promise<void>
  onInstallAndUse: (modelId: string) => Promise<void>
  onRemoveInstalled: (modelId: string) => Promise<void>
  onRescanDirectory: (modelDir: string) => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <Input
        id={`provider-settings-${providerId}-modelDir`}
        value={modelState.modelDir ?? ''}
        onChange={(event) => onRescanDirectory(event.target.value)}
      />
      {modelState.installedModels.map((model) => (
        <div key={model.id}>
          <Button type="button" onClick={() => void onSelectInstalled(model.id)}>
            {`Use installed ${model.name}`}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void onRemoveInstalled(model.id)}>
            Remove
          </Button>
        </div>
      ))}
      {modelState.catalogModels
        .filter((model) => !modelState.installedModels.some((installed) => installed.id === model.id))
        .map((model) => (
          <Button key={model.id} type="button" onClick={() => void onInstallAndUse(model.id)}>
            {`Download and use ${model.name}`}
          </Button>
        ))}
    </div>
  )
}
```

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-row.tsx
const hasSettings =
  provider.settingsItems.length > 0 || ('kind' in provider && provider.kind === 'local')
```

- [ ] **Step 4: Run the renderer providers test suite again**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit the local settings flow**

```bash
git add apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx apps/desktop/src/renderer/src/components/providers/provider-row.tsx apps/desktop/src/renderer/src/pages/main/providers.tsx apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat: add local asr settings management"
```

### Task 8: Final Regression Run And Documentation Sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-04-22-local-asr-model-management-design.md` (only if implementation reality forces a spec correction)
- Test: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
- Test: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts`
- Test: `apps/desktop/src/main/__tests__/providers-router.test.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
- Test: `pnpm --filter @openbroca/providers typecheck`

- [ ] **Step 1: Run the sherpa/provider/main/renderer suites together**

Run:

```bash
pnpm vitest run \
  packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts \
  packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts \
  apps/desktop/src/main/__tests__/providers-router.test.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts \
  apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run provider package typecheck**

Run:

```bash
pnpm --filter @openbroca/providers typecheck
```

Expected: PASS

- [ ] **Step 3: Re-read the design spec and update it only if implementation uncovered a real contract correction**

```md
## Migration and Compatibility

- keep `providers`, `providerSettings`, and `activeProviders` as the main persisted object shape
- preserve `selectedModelId` for local ASR providers
- do not preserve the old sherpa first-found model fallback
```

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff -- packages/providers apps/desktop docs/superpowers/specs/2026-04-22-local-asr-model-management-design.md
```

Expected: Reviewable diff limited to the shared local ASR platform, sherpa, desktop main/renderer provider flows, and the approved spec.

- [ ] **Step 5: Commit the final verification batch**

```bash
git add packages/providers apps/desktop docs/superpowers/specs/2026-04-22-local-asr-model-management-design.md
git commit -m "feat: add local asr model management"
```
