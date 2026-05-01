# Local ASR Model Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-path "download a model and use it" flow for local ASR providers. The `modelDir` is app-managed by default and not surfaced during connect; users only pick a catalog model. `sherpa-onnx` is the first concrete implementation. All settings changes converge on `providerSettings[id].selectedModelId`.

**Architecture:** Extend the local ASR contract so providers hold `modelDir` as construction state and expose a no-arg lifecycle (`listCatalogModels` / `scanInstalledModels` / `installModel` / `removeInstalledModel` / `resolveModelRuntime`). Convert the sherpa descriptor to a `createSherpaOnnxDescriptor({ defaultModelDir })` factory so main can inject the platform-managed default. Add main-process `providers.localModels.*` tRPC APIs with a single in-flight install iterator per provider — no separate task manager. Replace the renderer's local connect dialog with a catalog-only flow that highlights a locale-recommended model, and add a settings panel that supports switch / install-and-switch / remove plus an Advanced directory change.

**Tech Stack:** TypeScript, Zod, Electron main/renderer split, tRPC, Zustand, React, Vitest, Node `https` + `fs` streams, system `tar`.

---

### Task 1: Replace the local ASR contract with the new lifecycle and types

**Files:**
- Modify: `packages/providers/src/asr/contracts.ts`
- Modify: `packages/providers/src/asr/index.ts`
- Modify: `packages/providers/src/shared/settings.ts`
- Modify: `packages/providers/src/index.ts`
- Test: `packages/providers/src/asr/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing registry test for the new local ASR contract**

```ts
it('registers a local ASR descriptor whose provider exposes the no-arg lifecycle', async () => {
  const registry = new ASRProviderRegistry()

  const descriptor: ASRProviderDescriptor<{ modelDir: string }, { selectedModelId?: string }> = {
    id: 'mock-local',
    displayName: 'Mock Local',
    description: '',
    kind: 'local',
    configSchema: z.object({ modelDir: z.string() }),
    settingsSchema: z.object({ selectedModelId: z.string().optional() }),
    settingsItems: [
      { key: 'selectedModelId', type: 'local-model-select', label: 'Current model' }
    ],
    create: () => ({
      id: 'mock-local',
      displayName: 'Mock Local',
      isConfigured: () => true,
      recognize: async () => ({ text: '', segments: [] }),
      listCatalogModels: async () => [
        { id: 'm1', name: 'Model 1', sizeBytes: 1, downloadUrl: 'https://x', sha256: 'aa' }
      ],
      scanInstalledModels: async () => [],
      installModel: async function* () {
        yield { phase: 'downloading', downloadedBytes: 0, totalBytes: 1 } as const
        yield { phase: 'extracting' } as const
        yield { phase: 'validating' } as const
        yield { phase: 'finalizing' } as const
      },
      removeInstalledModel: async () => undefined,
      resolveModelRuntime: async (id) => ({ modelId: id, modelPath: '/tmp/mock' })
    })
  }

  registry.register(descriptor)
  const provider = registry.resolve('mock-local', { modelDir: '/tmp' })

  expect(registry.isLocal(provider)).toBe(true)
  if (registry.isLocal(provider)) {
    const catalog = await provider.listCatalogModels()
    expect(catalog[0]).toMatchObject({ id: 'm1', sha256: 'aa' })
    const events: string[] = []
    for await (const e of provider.installModel('m1')) events.push(e.phase)
    expect(events).toEqual(['downloading', 'extracting', 'validating', 'finalizing'])
  }
})
```

- [ ] **Step 2: Run the failing test to confirm the contract gap**

```bash
pnpm vitest run packages/providers/src/asr/__tests__/registry.test.ts
```

Expected: FAIL — `LocalASRProvider`, `LocalCatalogModel`, `LocalModelInstallEvent`, `local-model-select`, etc. don't exist yet.

- [ ] **Step 3: Add the new types and update the local ASR provider interface**

```ts
// packages/providers/src/asr/contracts.ts

export interface LocalCatalogModel {
  id: string
  name: string
  description?: string
  sizeBytes: number
  downloadUrl: string
  sha256: string
  /** ISO language tags this model is intended for; UI uses these to highlight a recommended default. */
  recommendedFor?: string[]
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

export type LocalModelInstallEvent =
  | { phase: 'downloading'; downloadedBytes: number; totalBytes: number }
  | { phase: 'extracting' }
  | { phase: 'validating' }
  | { phase: 'finalizing' }

export interface LocalASRProvider extends ASRProvider {
  listCatalogModels(): Promise<LocalCatalogModel[]>
  scanInstalledModels(): Promise<InstalledLocalModel[]>
  installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent>
  removeInstalledModel(modelId: string): Promise<void>
  resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime>
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

Re-export the new types from `packages/providers/src/asr/index.ts` and `packages/providers/src/index.ts`.

- [ ] **Step 4: Run the test again — it should now pass**

```bash
pnpm vitest run packages/providers/src/asr/__tests__/registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/asr/contracts.ts packages/providers/src/asr/index.ts packages/providers/src/shared/settings.ts packages/providers/src/index.ts packages/providers/src/asr/__tests__/registry.test.ts
git commit -m "refactor(providers): replace local asr contract with no-arg lifecycle"
```

---

### Task 2: Persist `selectedModelId` in `providerSettings` without breaking LLM `model`

**Files:**
- Modify: `apps/desktop/src/shared/provider-auth.ts`
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Test: `apps/desktop/src/shared/__tests__/provider-auth.test.ts` (or the existing nearest tests)
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`

- [ ] **Step 1: Write the failing normalization + runtime tests**

```ts
test('normalizeProviderSettings preserves trimmed selectedModelId for local ASR', () => {
  const out = normalizeProviderSettings({
    providers: {
      'sherpa-onnx': { enabled: true, connectionType: 'local', config: { modelDir: '/tmp/m' } }
    },
    providerSettings: {
      'sherpa-onnx': { selectedModelId: '  paraformer-zh  ' }
    }
  })
  expect(out.providerSettings['sherpa-onnx']).toEqual({ selectedModelId: 'paraformer-zh' })
})

test('normalize drops empty/whitespace selectedModelId rather than persisting it', () => {
  const out = normalizeProviderSettings({
    providers: {
      'sherpa-onnx': { enabled: true, connectionType: 'local', config: { modelDir: '/tmp/m' } }
    },
    providerSettings: { 'sherpa-onnx': { selectedModelId: '   ' } }
  })
  expect(out.providerSettings['sherpa-onnx']).toEqual({})
})
```

```ts
test('resolveActiveASRSelection returns selectedModelId from settings', async () => {
  // seed store with provider config + selectedModelId; assert selection.settings.selectedModelId
})
```

- [ ] **Step 2: Run the focused tests to confirm the gap**

```bash
pnpm vitest run apps/desktop/src/shared apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add `selectedModelId` normalization and runtime read**

```ts
// apps/desktop/src/shared/provider-auth.ts
function normalizeSelectedModelId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v ? v : null
}

// inside normalizeProviderSettings, when iterating settings:
if (Object.prototype.hasOwnProperty.call(nextSettings, 'selectedModelId')) {
  const id = normalizeSelectedModelId(nextSettings.selectedModelId)
  if (id) nextSettings.selectedModelId = id
  else delete nextSettings.selectedModelId
}
```

```ts
// apps/desktop/src/main/providers/runtime.ts
export function getActiveASRSelectedModelId(store: StoreLike): string | undefined {
  const settings = getNormalizedProviderSettings(store)
  const id = settings.activeProviders.asr
  const v = id ? settings.providerSettings[id]?.selectedModelId : undefined
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return trimmed ? trimmed : undefined
}
```

- [ ] **Step 4: Re-run the tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/provider-auth.ts apps/desktop/src/main/providers/runtime.ts apps/desktop/src/shared/__tests__ apps/desktop/src/main/__tests__/provider-runtime.test.ts
git commit -m "feat(desktop): persist local asr selectedModelId"
```

---

### Task 3: Convert sherpa descriptor to a factory and rewrite the provider

**Files:**
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
- Modify: `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`
- Modify: `apps/desktop/src/main/providers/index.ts`
- Test: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
- Test: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/provider.test.ts`

- [ ] **Step 1: Write failing tests for the factory descriptor and rewritten provider**

```ts
// descriptor.test.ts
it('createSherpaOnnxDescriptor sets a default modelDir from the injected platform path', () => {
  const descriptor = createSherpaOnnxDescriptor({ defaultModelDir: '/data/asr-models/sherpa-onnx' })
  expect(descriptor.id).toBe('sherpa-onnx')
  // schema accepts an empty config and applies the default
  const cfg = descriptor.configSchema.parse({}) as { modelDir: string }
  expect(cfg.modelDir).toBe('/data/asr-models/sherpa-onnx')
  // settingsItems advertise the new local-model-select type
  expect(descriptor.settingsItems?.[0]).toMatchObject({
    key: 'selectedModelId',
    type: 'local-model-select'
  })
})
```

```ts
// provider.test.ts
it('catalog entries carry sha256 and recommendedFor', async () => {
  const provider = makeProvider() // constructs SherpaOnnxASRProvider({ modelDir: '/tmp/models' })
  const catalog = await provider.listCatalogModels()
  expect(catalog).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'paraformer-zh', sha256: expect.any(String), recommendedFor: ['zh', 'zh-CN'] }),
      expect.objectContaining({ id: 'zipformer-en-small', sha256: expect.any(String), recommendedFor: ['en'] })
    ])
  )
})

it('installModel streams download to disk, verifies sha256, extracts, validates, and renames atomically', async () => {
  const provider = makeProvider()
  const events: string[] = []
  for await (const e of provider.installModel('paraformer-zh')) events.push(e.phase)
  expect(events).toEqual(['downloading', 'extracting', 'validating', 'finalizing'])

  // assert: createWriteStream was used (not Buffer.concat)
  // assert: sha256 verification was performed before extracting
  // assert: tar -xjf was invoked on the downloaded archive
  // assert: final rename happened from `${subDir}.staging` → `${subDir}`
  // assert: archive temp file removed on success
})

it('installModel cleans up staging + archive when the signal aborts mid-download', async () => {
  // assert: tmp archive path no longer exists
  // assert: no `${subDir}.staging` left behind
})

it('resolveModelRuntime requires the selected model to be installed', async () => {
  const provider = makeProvider()
  // installed: paraformer-zh only
  await expect(provider.resolveModelRuntime('paraformer-zh')).resolves.toMatchObject({
    modelId: 'paraformer-zh'
  })
  await expect(provider.resolveModelRuntime('zipformer-en-small')).rejects.toThrow(/not installed/i)
})
```

- [ ] **Step 2: Run the sherpa tests — FAIL**

```bash
pnpm vitest run packages/providers/src/asr/providers/sherpa-onnx/__tests__
```

Expected: FAIL — descriptor isn't a factory; provider has old method signatures; no streaming, no sha256, no staging.

- [ ] **Step 3: Rewrite descriptor and provider**

```ts
// packages/providers/src/asr/providers/sherpa-onnx/index.ts
import { z } from 'zod'
import type { ASRProviderDescriptor } from '../../contracts.ts'
import { providerIcons } from '../../../shared/icons/index.ts'
import { SherpaOnnxASRProvider, type SherpaOnnxConfig } from './provider.ts'

interface SherpaOnnxSettings {
  selectedModelId?: string
}

export function createSherpaOnnxDescriptor(opts: {
  defaultModelDir: string
}): ASRProviderDescriptor<SherpaOnnxConfig, SherpaOnnxSettings> {
  const configSchema = z
    .object({
      modelDir: z.string().min(1).default(opts.defaultModelDir)
    })
    .default({ modelDir: opts.defaultModelDir })

  const settingsSchema = z.object({
    selectedModelId: z.string().trim().min(1).optional()
  })

  return {
    id: 'sherpa-onnx',
    displayName: '@k2-fsa/sherpa-onnx',
    description: 'On-device speech recognition powered by sherpa-onnx — no internet required',
    icon: providerIcons['sherpa-onnx'],
    kind: 'local',
    capabilities: { streaming: true },
    configSchema,
    settingsSchema,
    settingsItems: [
      {
        key: 'selectedModelId',
        type: 'local-model-select',
        label: 'Current model',
        description: 'Switch to another installed model or download one from the catalog.'
      }
    ],
    connectionOptions: [
      {
        type: 'local',
        label: 'Local model',
        description: 'Models are stored under the app data directory by default.',
        fields: [
          {
            key: 'modelDir',
            label: 'Model directory',
            input: 'directory',
            required: false,
            placeholder: opts.defaultModelDir,
            description: 'Advanced: override where downloaded models are stored.'
          }
        ]
      }
    ],
    getSetupStatus: ({ settings }) => {
      const id = (settings as SherpaOnnxSettings | undefined)?.selectedModelId
      if (!id) {
        return {
          status: 'configured',
          canActivate: false,
          summary: 'Choose or download a model to finish setup.',
          blockingReasons: ['Select a model']
        }
      }
      return { status: 'ready', canActivate: true, summary: `Active: ${id}`, blockingReasons: [] }
    },
    create: (config) => new SherpaOnnxASRProvider(config)
  }
}

export {
  SherpaOnnxASRProvider,
  type SherpaOnnxConfig
} from './provider.ts'
```

```ts
// packages/providers/src/asr/providers/sherpa-onnx/provider.ts
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as https from 'node:https'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import { AsyncPushQueue } from '../../../shared/async-queue.ts'
import { assertPCMInput, normalizeAudioChunks, throwIfAborted } from '../../../shared/audio.ts'
import type {
  InstalledLocalModel,
  LocalASRProvider,
  LocalCatalogModel,
  LocalModelInstallEvent,
  LocalModelRuntime,
  RecognitionInput,
  RecognitionOptions,
  RecognitionResult,
  StreamingASRProvider,
  TranscriptionEvent,
  TranscriptionSegment
} from '../../contracts.ts'

interface SherpaModelManifestEntry {
  id: string
  name: string
  description?: string
  sizeBytes: number
  downloadUrl: string
  sha256: string
  archive: 'tar.bz2'
  subDir: string
  recommendedFor?: string[]
  /** Architecture-specific files we expect to find after extraction. */
  requiredFiles: string[]
  /** Architecture-specific recognizer config builder. */
  buildRecognizerConfig: (modelPath: string) => Record<string, unknown>
}

const MANIFEST: SherpaModelManifestEntry[] = [
  {
    id: 'zipformer-en-small',
    name: 'Zipformer English (Small)',
    sizeBytes: 66_000_000,
    downloadUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile.tar.bz2',
    sha256: 'TODO_FILL_FROM_RELEASE',
    archive: 'tar.bz2',
    subDir: 'sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile',
    recommendedFor: ['en'],
    requiredFiles: [
      'encoder-epoch-99-avg-1.onnx',
      'decoder-epoch-99-avg-1.onnx',
      'joiner-epoch-99-avg-1.onnx',
      'tokens.txt'
    ],
    buildRecognizerConfig: (modelPath) => ({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      enableEndpoint: 1,
      endpointConfig: defaultEndpoint,
      modelConfig: {
        transducer: {
          encoder: path.join(modelPath, 'encoder-epoch-99-avg-1.onnx'),
          decoder: path.join(modelPath, 'decoder-epoch-99-avg-1.onnx'),
          joiner: path.join(modelPath, 'joiner-epoch-99-avg-1.onnx')
        },
        tokens: path.join(modelPath, 'tokens.txt'),
        numThreads: 1,
        debug: 0
      }
    })
  },
  {
    id: 'paraformer-zh',
    name: 'Paraformer Chinese',
    sizeBytes: 220_000_000,
    downloadUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2',
    sha256: 'TODO_FILL_FROM_RELEASE',
    archive: 'tar.bz2',
    subDir: 'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
    recommendedFor: ['zh', 'zh-CN'],
    requiredFiles: ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'],
    buildRecognizerConfig: (modelPath) => ({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      enableEndpoint: 1,
      endpointConfig: defaultEndpoint,
      modelConfig: {
        paraformer: {
          encoder: path.join(modelPath, 'encoder.int8.onnx'),
          decoder: path.join(modelPath, 'decoder.int8.onnx')
        },
        tokens: path.join(modelPath, 'tokens.txt'),
        numThreads: 1,
        debug: 0
      }
    })
  }
]

const defaultEndpoint = {
  rule1: { minTrailingSilence: 2.4 },
  rule2: { minTrailingSilence: 1.2 },
  rule3: { minUtteranceLength: 20 }
}

export interface SherpaOnnxConfig {
  modelDir: string
}

export class SherpaOnnxASRProvider implements LocalASRProvider, StreamingASRProvider {
  readonly id = 'sherpa-onnx'
  readonly displayName = 'Sherpa-ONNX (Local)'

  private readonly modelDir: string

  constructor(config: SherpaOnnxConfig) {
    this.modelDir = config.modelDir
  }

  isConfigured(): boolean {
    return fs.existsSync(this.modelDir) || true // dir is auto-created on install; presence isn't required at construct time
  }

  async listCatalogModels(): Promise<LocalCatalogModel[]> {
    return MANIFEST.map(({ id, name, description, sizeBytes, downloadUrl, sha256, recommendedFor }) => ({
      id, name, description, sizeBytes, downloadUrl, sha256, recommendedFor
    }))
  }

  async scanInstalledModels(): Promise<InstalledLocalModel[]> {
    return MANIFEST
      .map((entry) => ({ entry, modelPath: path.join(this.modelDir, entry.subDir) }))
      .filter(({ entry, modelPath }) => fs.existsSync(modelPath) && hasRequiredFiles(entry, modelPath))
      .map(({ entry, modelPath }) => ({
        id: entry.id,
        name: entry.name,
        path: modelPath,
        sizeBytes: entry.sizeBytes
      }))
  }

  async *installModel(modelId: string, signal?: AbortSignal): AsyncIterable<LocalModelInstallEvent> {
    const entry = getEntry(modelId)
    fs.mkdirSync(this.modelDir, { recursive: true })

    const archivePath = path.join(this.modelDir, `${modelId}.${entry.archive}.tmp`)
    const stagingPath = path.join(this.modelDir, `${entry.subDir}.staging`)
    const finalPath = path.join(this.modelDir, entry.subDir)

    try {
      yield* downloadStream(entry.downloadUrl, archivePath, signal)
      yield { phase: 'extracting' }
      verifySha256(archivePath, entry.sha256)
      extractTarBz2(archivePath, this.modelDir, stagingPath, entry.subDir)
      yield { phase: 'validating' }
      if (!hasRequiredFiles(entry, stagingPath)) {
        throw new TranscriptionError(this.id, 'Installed model is missing required files')
      }
      yield { phase: 'finalizing' }
      fs.rmSync(finalPath, { recursive: true, force: true })
      fs.renameSync(stagingPath, finalPath)
    } finally {
      fs.rmSync(archivePath, { force: true })
      fs.rmSync(stagingPath, { recursive: true, force: true })
    }
  }

  async removeInstalledModel(modelId: string): Promise<void> {
    const entry = getEntry(modelId)
    const target = path.join(this.modelDir, entry.subDir)
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
  }

  async resolveModelRuntime(selectedModelId: string): Promise<LocalModelRuntime> {
    const entry = getEntry(selectedModelId)
    const modelPath = path.join(this.modelDir, entry.subDir)
    if (!fs.existsSync(modelPath) || !hasRequiredFiles(entry, modelPath)) {
      throw new ConfigurationError(this.id, `Selected model "${selectedModelId}" is not installed`)
    }
    return { modelId: selectedModelId, modelPath }
  }

  // ... existing recognize / transcribe / runTranscription stay,
  //     except createOnlineRecognizer reads selectedModelId via resolveModelRuntime
  //     instead of scanning for the first installed model.
}

function getEntry(modelId: string): SherpaModelManifestEntry {
  const entry = MANIFEST.find((e) => e.id === modelId)
  if (!entry) throw new TranscriptionError('sherpa-onnx', `Unknown model: ${modelId}`)
  return entry
}

function hasRequiredFiles(entry: SherpaModelManifestEntry, modelPath: string): boolean {
  return entry.requiredFiles.every((f) => fs.existsSync(path.join(modelPath, f)))
}

async function* downloadStream(
  url: string,
  destPath: string,
  signal?: AbortSignal
): AsyncIterable<LocalModelInstallEvent> {
  const queue = new AsyncPushQueue<LocalModelInstallEvent>()
  let downloaded = 0
  let total = 0

  const cleanup = () => fs.rmSync(destPath, { force: true })

  https.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      const loc = res.headers.location
      if (!loc) {
        queue.fail(new TranscriptionError('sherpa-onnx', 'Redirect with no Location header'))
        return
      }
      // re-issue against the new URL by recursing
      ;(async () => {
        try {
          for await (const e of downloadStream(loc, destPath, signal)) queue.push(e)
          queue.end()
        } catch (err) {
          queue.fail(err as Error)
        }
      })()
      return
    }
    if (res.statusCode !== 200) {
      queue.fail(new TranscriptionError('sherpa-onnx', `HTTP ${res.statusCode}`))
      return
    }

    total = Number.parseInt(res.headers['content-length'] ?? '0', 10)
    const out = fs.createWriteStream(destPath)
    signal?.addEventListener('abort', () => {
      res.destroy()
      out.destroy()
      cleanup()
      queue.fail(new TranscriptionError('sherpa-onnx', 'Download aborted'))
    })
    res.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      queue.push({ phase: 'downloading', downloadedBytes: downloaded, totalBytes: total })
    })
    res.pipe(out)
    out.on('finish', () => queue.end())
    out.on('error', (err) => {
      cleanup()
      queue.fail(new TranscriptionError('sherpa-onnx', err.message, err))
    })
    res.on('error', (err) => {
      cleanup()
      queue.fail(new TranscriptionError('sherpa-onnx', err.message, err))
    })
  }).on('error', (err) => {
    cleanup()
    queue.fail(new TranscriptionError('sherpa-onnx', err.message, err))
  })

  yield* queue.drain()
}

function verifySha256(filePath: string, expected: string): void {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  const actual = hash.digest('hex')
  if (actual !== expected) {
    throw new TranscriptionError(
      'sherpa-onnx',
      `Downloaded archive sha256 mismatch (expected ${expected}, got ${actual})`
    )
  }
}

function extractTarBz2(archivePath: string, modelDir: string, stagingPath: string, finalSubDir: string): void {
  fs.rmSync(stagingPath, { recursive: true, force: true })
  // tar extracts relative to -C; the archive contains a top-level dir named `finalSubDir`.
  // Extract into modelDir, then move the extracted dir to staging.
  execFileSync('tar', ['-xjf', archivePath, '-C', modelDir])
  const extractedPath = path.join(modelDir, finalSubDir)
  if (!fs.existsSync(extractedPath)) {
    throw new TranscriptionError(
      'sherpa-onnx',
      `Archive did not contain expected directory ${finalSubDir}`
    )
  }
  fs.renameSync(extractedPath, stagingPath)
}
```

```ts
// apps/desktop/src/main/providers/index.ts
import { app } from 'electron'
import * as path from 'node:path'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { createSherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

llmRegistry.register(openaiDescriptor)
llmRegistry.register(openaiCodexDescriptor)
llmRegistry.register(openrouterDescriptor)
asrRegistry.register(deepgramDescriptor)
asrRegistry.register(
  createSherpaOnnxDescriptor({
    defaultModelDir: path.join(app.getPath('userData'), 'asr-models', 'sherpa-onnx')
  })
)
```

- [ ] **Step 4: Re-run sherpa tests — PASS**

```bash
pnpm vitest run packages/providers/src/asr/providers/sherpa-onnx/__tests__
```

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/asr/providers/sherpa-onnx apps/desktop/src/main/providers/index.ts
git commit -m "feat(providers): rewrite sherpa-onnx with streamed install + sha256 + factory descriptor"
```

---

### Task 4: Add main-process `providers.localModels.*` tRPC APIs

**Files:**
- Create: `apps/desktop/src/main/providers/local-models.ts`
- Modify: `apps/desktop/src/main/trpc/routers/providers.ts`
- Modify: `apps/desktop/src/main/trpc/context.ts` (only if a small in-flight holder needs to be plumbed)
- Test: `apps/desktop/src/main/__tests__/providers-router.test.ts`

- [ ] **Step 1: Write failing router tests**

```ts
test('localModels.getState returns modelDir, selectedModelId, catalog and installed lists', async () => {
  // register a fake local descriptor whose provider returns a known catalog and installed list;
  // seed providers/providerSettings; call caller.providers.localModels.getState({ providerId })
  // expect { modelDir, selectedModelId, catalogModels: [...], installedModels: [...] }
})

test('localModels.select writes providerSettings.selectedModelId and enables provider', async () => {
  // call select; assert store now has selectedModelId set and enabled: true
})

test('localModels.install streams events and writes selectedModelId on completion', async () => {
  // run subscription to completion; assert events shape and final store state
})

test('localModels.install rejects a second install for a different modelId while one is in flight', async () => {
  // start install for m1; concurrently call install for m2 and expect ProviderError "another install is in progress"
})

test('localModels.cancelInstall aborts the in-flight install and cleans temp files', async () => {
  // start install; call cancel; assert AbortController was triggered and the install iterator throws / ends
})

test('localModels.changeDirectory writes config.modelDir and evicts the cached provider', async () => {
  // resolve once at /a; call changeDirectory to /b; resolve again — expect a fresh instance
})
```

- [ ] **Step 2: Run router tests — FAIL**

```bash
pnpm vitest run apps/desktop/src/main/__tests__/providers-router.test.ts
```

- [ ] **Step 3: Implement the local-models service and router procedures**

```ts
// apps/desktop/src/main/providers/local-models.ts
import type { ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LocalModelInstallEvent } from '@openbroca/providers/asr'
import { ConfigurationError, ProviderError } from '@openbroca/providers'
import {
  getNormalizedProviderSettings,
  type StoreLike
} from './runtime'
import { normalizeProviderSettings } from '../../shared/provider-auth'

export interface MutableStoreLike extends StoreLike {
  set(key: string, value: unknown): void
}

interface InFlightInstall {
  modelId: string
  controller: AbortController
}

const inFlight = new Map<string, InFlightInstall>()

export async function getLocalModelState(deps: {
  asrRegistry: ASRProviderRegistry
  store: MutableStoreLike
  providerId: string
}) {
  const settings = getNormalizedProviderSettings(deps.store)
  const record = settings.providers[deps.providerId]
  if (record?.connectionType !== 'local') {
    throw new ProviderError(deps.providerId, 'Provider is not a local ASR provider')
  }

  const provider = deps.asrRegistry.resolve(deps.providerId, record.config ?? {})
  if (!deps.asrRegistry.isLocal(provider)) {
    throw new ProviderError(deps.providerId, 'Provider is not local')
  }

  const modelDir = (record.config as { modelDir?: string } | undefined)?.modelDir
  return {
    modelDir,
    selectedModelId: settings.providerSettings[deps.providerId]?.selectedModelId,
    catalogModels: await provider.listCatalogModels(),
    installedModels: await provider.scanInstalledModels()
  }
}

export async function selectLocalModel(deps: {
  store: MutableStoreLike
  providerId: string
  modelId: string
}): Promise<void> {
  const current = getNormalizedProviderSettings(deps.store)
  deps.store.set('providers', normalizeProviderSettings({
    ...current,
    providers: {
      ...current.providers,
      [deps.providerId]: { ...current.providers[deps.providerId], enabled: true }
    },
    providerSettings: {
      ...current.providerSettings,
      [deps.providerId]: {
        ...(current.providerSettings[deps.providerId] ?? {}),
        selectedModelId: deps.modelId
      }
    }
  }))
}

export async function* installLocalModel(deps: {
  asrRegistry: ASRProviderRegistry
  store: MutableStoreLike
  providerId: string
  modelId: string
}): AsyncIterable<LocalModelInstallEvent> {
  const existing = inFlight.get(deps.providerId)
  if (existing && existing.modelId !== deps.modelId) {
    throw new ProviderError(
      deps.providerId,
      `Another install (${existing.modelId}) is already in progress for this provider`
    )
  }

  const settings = getNormalizedProviderSettings(deps.store)
  const record = settings.providers[deps.providerId]
  if (record?.connectionType !== 'local') {
    throw new ProviderError(deps.providerId, 'Provider is not local')
  }
  const provider = deps.asrRegistry.resolve(deps.providerId, record.config ?? {})
  if (!deps.asrRegistry.isLocal(provider)) {
    throw new ProviderError(deps.providerId, 'Provider is not local')
  }

  const controller = new AbortController()
  inFlight.set(deps.providerId, { modelId: deps.modelId, controller })

  try {
    yield* provider.installModel(deps.modelId, controller.signal)
    await selectLocalModel({ store: deps.store, providerId: deps.providerId, modelId: deps.modelId })
  } finally {
    inFlight.delete(deps.providerId)
  }
}

export function cancelLocalInstall(providerId: string): void {
  const handle = inFlight.get(providerId)
  if (handle) handle.controller.abort()
}

export async function changeLocalModelDirectory(deps: {
  asrRegistry: ASRProviderRegistry
  store: MutableStoreLike
  providerId: string
  modelDir: string
}): Promise<void> {
  const current = getNormalizedProviderSettings(deps.store)
  deps.store.set('providers', normalizeProviderSettings({
    ...current,
    providers: {
      ...current.providers,
      [deps.providerId]: {
        enabled: current.providers[deps.providerId]?.enabled ?? false,
        connectionType: 'local',
        config: { modelDir: deps.modelDir }
      }
    },
    providerSettings: {
      ...current.providerSettings,
      // selected model under the old dir is no longer guaranteed installed; clear it so
      // setup-status drops out of `ready` until the user picks again.
      [deps.providerId]: {}
    }
  }))
  // registry already evicts cached instances on config change via stableCacheKey
}

export async function removeLocalModel(deps: {
  asrRegistry: ASRProviderRegistry
  store: MutableStoreLike
  providerId: string
  modelId: string
}): Promise<void> {
  const settings = getNormalizedProviderSettings(deps.store)
  const record = settings.providers[deps.providerId]
  if (record?.connectionType !== 'local') {
    throw new ProviderError(deps.providerId, 'Provider is not local')
  }
  const provider = deps.asrRegistry.resolve(deps.providerId, record.config ?? {})
  if (!deps.asrRegistry.isLocal(provider)) {
    throw new ProviderError(deps.providerId, 'Provider is not local')
  }
  await provider.removeInstalledModel(deps.modelId)

  // If the removed model was the selected one, clear the selection.
  if (settings.providerSettings[deps.providerId]?.selectedModelId === deps.modelId) {
    deps.store.set('providers', normalizeProviderSettings({
      ...settings,
      providerSettings: {
        ...settings.providerSettings,
        [deps.providerId]: { ...settings.providerSettings[deps.providerId], selectedModelId: undefined }
      }
    }))
  }
}
```

```ts
// apps/desktop/src/main/trpc/routers/providers.ts (additions)
import { observable } from '@trpc/server/observable'
import {
  cancelLocalInstall,
  changeLocalModelDirectory,
  getLocalModelState,
  installLocalModel,
  removeLocalModel,
  selectLocalModel
} from '../../providers/local-models'

const localModelsRouter = router({
  getState: publicProcedure
    .input(z.object({ providerId: z.string() }))
    .query(({ ctx, input }) =>
      getLocalModelState({ asrRegistry: ctx.asrRegistry, store: ctx.store, providerId: input.providerId })
    ),

  select: publicProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await selectLocalModel({ store: ctx.store, ...input })
      return getLocalModelState({ asrRegistry: ctx.asrRegistry, store: ctx.store, providerId: input.providerId })
    }),

  install: publicProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .subscription(({ ctx, input }) =>
      observable<LocalModelInstallEvent>((emit) => {
        let cancelled = false
        ;(async () => {
          try {
            for await (const event of installLocalModel({
              asrRegistry: ctx.asrRegistry,
              store: ctx.store,
              ...input
            })) {
              if (cancelled) break
              emit.next(event)
            }
            emit.complete()
          } catch (err) {
            emit.error(err)
          }
        })()
        return () => {
          cancelled = true
          cancelLocalInstall(input.providerId)
        }
      })
    ),

  cancelInstall: publicProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(({ input }) => {
      cancelLocalInstall(input.providerId)
    }),

  remove: publicProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await removeLocalModel({ asrRegistry: ctx.asrRegistry, store: ctx.store, ...input })
      return getLocalModelState({ asrRegistry: ctx.asrRegistry, store: ctx.store, providerId: input.providerId })
    }),

  changeDirectory: publicProcedure
    .input(z.object({ providerId: z.string(), modelDir: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await changeLocalModelDirectory({ asrRegistry: ctx.asrRegistry, store: ctx.store, ...input })
      return getLocalModelState({ asrRegistry: ctx.asrRegistry, store: ctx.store, providerId: input.providerId })
    })
})

// inside providersRouter:
localModels: localModelsRouter
```

- [ ] **Step 4: Re-run router tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/providers/local-models.ts apps/desktop/src/main/trpc apps/desktop/src/main/__tests__/providers-router.test.ts
git commit -m "feat(desktop): add providers.localModels.* trpc apis"
```

---

### Task 5: Enforce runtime + setup-status against `selectedModelId` and installed-on-disk state

**Files:**
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Modify: `apps/desktop/src/main/providers/setup-status.ts`
- Test: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`
- Test: `apps/desktop/src/main/__tests__/providers-router.test.ts` (setup-status branch)

- [ ] **Step 1: Write failing tests for strict resolution and status transitions**

```ts
test('resolveActiveASRSelection throws when selectedModelId is missing for a local provider', async () => {
  // provider exists, modelDir set, but no selectedModelId; expect ConfigurationError matching /Select a local ASR model/i
})

test('resolveActiveASRSelection passes selectedModelId through to settings for downstream consumers', async () => {
  // selectedModelId persisted; expect selection.settings.selectedModelId
})

test('setup-status returns invalid when the selected model is not installed in modelDir', async () => {
  // selectedModelId points at m1, scanInstalledModels returns []; expect status === 'invalid'
})

test('setup-status returns ready when selected model is installed', async () => {})
```

- [ ] **Step 2: Run focused tests — FAIL**

- [ ] **Step 3: Update runtime + setup-status**

```ts
// apps/desktop/src/main/providers/runtime.ts (excerpt)
export async function resolveActiveASRSelection(deps: ASRProviderRuntimeDeps): Promise<ActiveASRSelection> {
  // ...existing checks for providerId / record.enabled...
  const provider = deps.asrRegistry.resolve(providerId, providerRecord.config ?? {})
  const settings = resolveValidatedASRProviderSettings(deps, providerId)

  if (deps.asrRegistry.isLocal(provider)) {
    const selectedModelId = typeof settings.selectedModelId === 'string' ? settings.selectedModelId.trim() : ''
    if (!selectedModelId) {
      throw new ConfigurationError(providerId, 'Select a local ASR model before activating this provider.')
    }
    // Verify the model is actually installed; throws ConfigurationError if not.
    await provider.resolveModelRuntime(selectedModelId)
  }

  return { provider, settings }
}
```

```ts
// apps/desktop/src/main/providers/setup-status.ts (local branch)
if (descriptor.kind === 'local' && connection?.connectionType === 'local') {
  const provider = deps.asrRegistry.resolve(providerId, connection.config ?? {})
  if (deps.asrRegistry.isLocal(provider)) {
    const selectedModelId = settings?.selectedModelId
    if (typeof selectedModelId !== 'string' || selectedModelId.trim().length === 0) {
      return {
        status: 'configured',
        canActivate: false,
        blockingReasons: ['Choose or download a model first']
      }
    }
    const installed = await provider.scanInstalledModels()
    if (!installed.some((m) => m.id === selectedModelId)) {
      return {
        status: 'invalid',
        canActivate: false,
        blockingReasons: ['The selected model is not installed']
      }
    }
  }
}
```

- [ ] **Step 4: Re-run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/providers/runtime.ts apps/desktop/src/main/providers/setup-status.ts apps/desktop/src/main/__tests__/provider-runtime.test.ts apps/desktop/src/main/__tests__/providers-router.test.ts
git commit -m "feat(desktop): enforce local asr runtime readiness against selectedModelId"
```

---

### Task 6: Single-path local ASR connect dialog (download a catalog model)

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write failing renderer tests for the new local connect flow**

```ts
test('local connect renders the catalog with the locale-recommended model highlighted', async () => {
  // mock app locale to 'zh-CN'; mock localModels.getState catalog with paraformer-zh + zipformer-en
  // expect paraformer-zh to render with a `Recommended` badge and to be the focused/default download target
})

test('clicking download streams progress and finalizes with selectedModelId saved', async () => {
  // mock the install subscription to emit downloading → extracting → validating → finalizing
  // assert the dialog shows a progress bar during downloading, spinners during the others
  // assert the store ends up with config.modelDir set + selectedModelId = 'paraformer-zh' + enabled: true
})

test('clicking cancel during download calls localModels.cancelInstall', async () => {})
```

- [ ] **Step 2: Run renderer tests — FAIL**

- [ ] **Step 3: Replace the local branch of the connect dialog**

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx (excerpt)

function LocalASRConnectPanel({ providerId }: { providerId: string }) {
  const stateQuery = trpc.providers.localModels.getState.useQuery({ providerId })
  const cancelMutation = trpc.providers.localModels.cancelInstall.useMutation()
  const [installing, setInstalling] = useState<{ modelId: string; event?: LocalModelInstallEvent } | null>(null)

  const recommendedModelId = useMemo(() => {
    const catalog = stateQuery.data?.catalogModels ?? []
    const locale = window.navigator.language // or via api
    const match = catalog.find((m) => m.recommendedFor?.some((tag) => locale.startsWith(tag)))
    return (match ?? catalog[0])?.id
  }, [stateQuery.data])

  const startInstall = (modelId: string) => {
    setInstalling({ modelId })
    trpcClient.providers.localModels.install.subscribe(
      { providerId, modelId },
      {
        onData: (event) => setInstalling({ modelId, event }),
        onComplete: () => {
          setInstalling(null)
          // store will have been updated server-side; refetch state
          stateQuery.refetch()
          // close dialog (parent listens via prop)
        },
        onError: (err) => {
          setInstalling(null)
          toast.error(err.message)
        }
      }
    )
  }

  // render:
  // - if installing: phase-aware progress (only `downloading` shows %)
  //   - cancel button calls cancelMutation.mutate({ providerId })
  // - else: list catalog models, mark recommendedModelId, button "Download and use"
}
```

- [ ] **Step 4: Re-run renderer tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx apps/desktop/src/renderer/src/pages/main/providers.tsx apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat(desktop): single-path local asr connect with streamed install"
```

---

### Task 7: Local ASR settings panel (switch / install / remove + Advanced directory)

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

```ts
test('settings can switch active model among installed ones', async () => {
  // installed: [paraformer-zh, zipformer-en]; selected: paraformer-zh
  // click "Use Zipformer English"
  // expect localModels.select called with modelId 'zipformer-en-small'
})

test('settings can install an additional catalog model and auto-select it', async () => {})

test('settings can remove a non-active installed model', async () => {})

test('settings refuses to remove the currently selected model with a clear error', async () => {})

test('Advanced disclosure can change the model directory and triggers a rescan', async () => {})
```

- [ ] **Step 2: Run renderer tests — FAIL**

- [ ] **Step 3: Build the settings panel**

```tsx
// apps/desktop/src/renderer/src/components/providers/provider-settings-dialog.tsx (excerpt)

function LocalModelSettingsPanel({ providerId }: { providerId: string }) {
  const stateQuery = trpc.providers.localModels.getState.useQuery({ providerId })
  const selectMutation = trpc.providers.localModels.select.useMutation()
  const removeMutation = trpc.providers.localModels.remove.useMutation()
  const changeDirMutation = trpc.providers.localModels.changeDirectory.useMutation()

  const data = stateQuery.data
  if (!data) return <Spinner />

  const installedIds = new Set(data.installedModels.map((m) => m.id))
  const notInstalledCatalog = data.catalogModels.filter((m) => !installedIds.has(m.id))

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Installed models</SectionTitle>
        {data.installedModels.map((m) => (
          <Row key={m.id}>
            <Radio
              checked={data.selectedModelId === m.id}
              onChange={() => selectMutation.mutate({ providerId, modelId: m.id })}
            >
              {m.name}
            </Radio>
            <Button
              variant="ghost"
              disabled={data.selectedModelId === m.id}
              onClick={() => removeMutation.mutate({ providerId, modelId: m.id })}
            >
              Remove
            </Button>
          </Row>
        ))}
      </section>

      <section>
        <SectionTitle>More models</SectionTitle>
        {notInstalledCatalog.map((m) => (
          <Row key={m.id}>
            <span>{m.name} · {humanBytes(m.sizeBytes)}</span>
            <DownloadAndUseButton providerId={providerId} modelId={m.id} />
          </Row>
        ))}
      </section>

      <Disclosure label="Advanced">
        <Field
          label="Model directory"
          value={data.modelDir ?? ''}
          onCommit={(modelDir) => changeDirMutation.mutate({ providerId, modelDir })}
        />
      </Disclosure>
    </div>
  )
}
```

`DownloadAndUseButton` reuses the install-subscription pattern from Task 6, factored into a small hook so the connect dialog and the settings panel share logic.

- [ ] **Step 4: Re-run renderer tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/providers apps/desktop/src/renderer/src/pages/main
git commit -m "feat(desktop): local asr settings — switch/install/remove + advanced dir"
```

---

### Task 8: Final regression sweep + spec touch-ups

**Files:**
- Test: full provider package test suite
- Test: full desktop test suite (where unrelated pre-existing failures exist on `main`, only check for *new* regressions)
- Test: `pnpm --filter @openbroca/providers typecheck`
- Test: `pnpm --filter desktop typecheck`
- Modify: `docs/superpowers/specs/2026-04-22-local-asr-model-management-design.md` (only if implementation forces a contract correction)

- [ ] **Step 1: Run package tests + typecheck**

```bash
pnpm --filter @openbroca/providers test
pnpm --filter @openbroca/providers typecheck
```

Expected: PASS.

- [ ] **Step 2: Run desktop tests + typecheck**

```bash
pnpm --filter desktop test
pnpm --filter desktop typecheck
```

Expected: any failures match `git stash && git checkout main && pnpm --filter desktop test` failures one-for-one (no *new* regressions).

- [ ] **Step 3: Re-read the design spec; update it only if implementation uncovered a real contract correction**

- [ ] **Step 4: Review final diff**

```bash
git diff main -- packages/providers apps/desktop docs/superpowers/specs/2026-04-22-local-asr-model-management-design.md
```

Expected: changes scoped to local ASR contract, sherpa provider, desktop main local-models service, desktop renderer connect/settings, and (if needed) the spec.

- [ ] **Step 5: Final commit if any cleanup edits remain**

```bash
git add packages/providers apps/desktop docs/superpowers/specs/2026-04-22-local-asr-model-management-design.md
git commit -m "feat: local asr model management end-to-end"
```
