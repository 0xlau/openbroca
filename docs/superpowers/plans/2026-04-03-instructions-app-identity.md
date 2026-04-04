# Instructions And App Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable desktop app-identity package plus a new desktop `Instructions` feature that lets users bind multiple apps to named instruction rules with optional custom prompt text and per-rule `Auto enter`.

**Architecture:** Add a new workspace package, `@openbroca/app-identity`, that owns cross-platform app identity types, normalization, catalog discovery, and frontmost-app lookup. Keep desktop-only instruction rules inside `apps/desktop`, with a shared desktop schema file, a persisted renderer store, a TRPC-backed app catalog service, a grid-and-card shadcn UI, and a main-process matcher that can feed the post-recording pipeline.

**Tech Stack:** Electron, React, TRPC, Zustand, shadcn/ui, TypeScript, Vitest, Testing Library, `get-windows`, Node child processes

---

## Preflight

### Task 0: Create The Dedicated Worktree

**Files:**
- None

- [ ] **Step 1: Create the implementation worktree and branch**

Run:

```bash
git worktree add ../openbroca-instructions -b feat/instructions-app-identity
```

Expected: git reports a new worktree at `../openbroca-instructions` on branch `feat/instructions-app-identity`.

- [ ] **Step 2: Enter the worktree and verify status is clean enough for feature work**

Run:

```bash
cd ../openbroca-instructions
git status --short
```

Expected: no unrelated tracked modifications in the new worktree. Untracked local scratch files are acceptable only if they are not part of this feature.

- [ ] **Step 3: Install workspace dependencies from the worktree**

Run:

```bash
pnpm install
```

Expected: lockfile and workspace install complete successfully so new package dependencies can be resolved.

---

## File Structure

### Existing Files To Modify

- `apps/desktop/package.json`
  Add the new workspace dependency and any app-level dependency needed by the app identity service.
- `apps/desktop/src/main/index.ts`
  Instantiate the app identity service, matcher, and auto-enter sender, then inject them into TRPC context and the post-recording pipeline.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Consume the matched instruction rule when composing the LLM prompt and optionally trigger auto-enter after completion.
- `apps/desktop/src/main/store/instance.ts`
  Add persisted defaults for `instructions`.
- `apps/desktop/src/main/store/schema.ts`
  Add the `instructions` store schema entry.
- `apps/desktop/src/main/trpc/context.ts`
  Add the app identity service to the TRPC context.
- `apps/desktop/src/main/trpc/router.ts`
  Register the new `appIdentity` router.
- `apps/desktop/src/main/trpc/routers/store.ts`
  Allow persisted `instructions` access through the safe store router.
- `apps/desktop/src/main/trpc/routers/__tests__/store.test.ts`
  Verify `instructions` is allowed while `voiceHistory` remains blocked.
- `apps/desktop/src/renderer/src/router/index.tsx`
  Register the `/instructions` route.
- `apps/desktop/src/renderer/src/components/nav-main.tsx`
  Keep the existing nav item aligned with the new route behavior if copy or icon details need adjustment.
- `apps/desktop/src/renderer/src/stores/index.ts`
  Export the new instructions store.

### New Shared Package Files To Create

- `packages/app-identity/package.json`
  Workspace package manifest with exports, test script, and dependencies.
- `packages/app-identity/tsconfig.json`
  TypeScript configuration matching the other workspace packages.
- `packages/app-identity/vitest.config.ts`
  Package-local Vitest config.
- `packages/app-identity/src/index.ts`
  Public exports.
- `packages/app-identity/src/contracts.ts`
  App identity types and service options.
- `packages/app-identity/src/normalize.ts`
  Stable id normalization and dedupe helpers.
- `packages/app-identity/src/manual.ts`
  Manual app-entry normalization.
- `packages/app-identity/src/discovery.ts`
  Cross-platform `listApps()` and `getFrontmostApp()` entry points.
- `packages/app-identity/src/platform/macos.ts`
  macOS-specific catalog and frontmost discovery helpers.
- `packages/app-identity/src/platform/windows.ts`
  Windows-specific catalog and frontmost discovery helpers.
- `packages/app-identity/src/__tests__/normalize.test.ts`
  Stable id and dedupe tests.
- `packages/app-identity/src/__tests__/manual.test.ts`
  Manual-entry normalization tests.
- `packages/app-identity/src/__tests__/discovery.test.ts`
  Discovery orchestration tests with mocked platform adapters.

### New Desktop Shared And Main Files To Create

- `apps/desktop/src/shared/instructions.ts`
  Desktop-only instruction types, defaults, normalization, and duplicate-ownership pruning.
- `apps/desktop/src/main/app-identity/service.ts`
  Desktop service that wraps `@openbroca/app-identity` and resolves icons via Electron.
- `apps/desktop/src/main/instructions/matcher.ts`
  Resolve the currently matched instruction rule from the persisted rules plus the frontmost app.
- `apps/desktop/src/main/send-key/auto-enter.ts`
  Small cross-platform service that simulates pressing Enter after processing when requested.
- `apps/desktop/src/main/trpc/routers/app-identity.ts`
  TRPC router exposing `listApps` and `frontmost`.
- `apps/desktop/src/main/__tests__/app-identity-service.test.ts`
  Main-process service tests.
- `apps/desktop/src/main/__tests__/instructions-matcher.test.ts`
  Matcher tests.
- `apps/desktop/src/main/__tests__/auto-enter.test.ts`
  Auto-enter service tests.

### New Desktop Renderer Files To Create

- `apps/desktop/src/renderer/src/stores/instructions-store.ts`
  Persisted renderer store for instruction rules.
- `apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts`
  Hydration and normalization tests for the new store.
- `apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx`
  Card UI for one instruction item.
- `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
  Searchable multi-select for detected and manual apps.
- `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`
  Fallback dialog for entering a manual app identity.
- `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`
  Create and edit dialog with `Name`, `Activation apps`, `Custom instructions`, and `Auto enter`.
- `apps/desktop/src/renderer/src/pages/main/instructions.tsx`
  Grid-and-card instructions page.
- `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
  Page-level behavior tests.

---

### Task 1: Scaffold `@openbroca/app-identity` And Lock Down Identity Normalization

**Files:**
- Create: `packages/app-identity/package.json`
- Create: `packages/app-identity/tsconfig.json`
- Create: `packages/app-identity/vitest.config.ts`
- Create: `packages/app-identity/src/index.ts`
- Create: `packages/app-identity/src/contracts.ts`
- Create: `packages/app-identity/src/normalize.ts`
- Create: `packages/app-identity/src/manual.ts`
- Create: `packages/app-identity/src/__tests__/normalize.test.ts`
- Create: `packages/app-identity/src/__tests__/manual.test.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Write the failing normalization test for stable ids**

Create `packages/app-identity/src/__tests__/normalize.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { dedupeAppIdentities, normalizeDetectedAppIdentity } from '../normalize'

describe('normalizeDetectedAppIdentity', () => {
  test('prefers bundleId on macOS and aumid on Windows', () => {
    expect(
      normalizeDetectedAppIdentity({
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected'
      })
    ).toMatchObject({
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor'
    })

    expect(
      normalizeDetectedAppIdentity({
        displayName: 'ChatGPT',
        platform: 'windows',
        aumid: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT',
        path: 'C:\\\\Program Files\\\\WindowsApps\\\\ChatGPT.exe',
        source: 'detected'
      })
    ).toMatchObject({
      id: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT',
      displayName: 'ChatGPT'
    })
  })

  test('falls back to path and dedupes by normalized id', () => {
    const identities = dedupeAppIdentities([
      normalizeDetectedAppIdentity({
        displayName: 'Chrome',
        platform: 'windows',
        path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
        source: 'detected'
      }),
      normalizeDetectedAppIdentity({
        displayName: 'Google Chrome',
        platform: 'windows',
        path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
        source: 'detected'
      })
    ])

    expect(identities).toHaveLength(1)
    expect(identities[0]?.id).toBe('C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe')
  })
})
```

- [ ] **Step 2: Write the failing manual-entry normalization test**

Create `packages/app-identity/src/__tests__/manual.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { normalizeManualAppIdentity } from '../manual'

describe('normalizeManualAppIdentity', () => {
  test('keeps explicit stable ids and trims empty optional fields', () => {
    expect(
      normalizeManualAppIdentity({
        displayName: 'Internal Tool',
        platform: 'windows',
        stableId: 'Contoso.InternalTool',
        bundleId: '   ',
        aumid: 'Contoso.InternalTool',
        path: ''
      })
    ).toEqual({
      id: 'Contoso.InternalTool',
      displayName: 'Internal Tool',
      platform: 'windows',
      aumid: 'Contoso.InternalTool',
      source: 'manual'
    })
  })
})
```

- [ ] **Step 3: Run the package tests and verify they fail**

Run:

```bash
pnpm vitest run packages/app-identity/src/__tests__/normalize.test.ts packages/app-identity/src/__tests__/manual.test.ts
```

Expected: FAIL because the package and exports do not exist yet.

- [ ] **Step 4: Create the package manifest and TypeScript config**

Create `packages/app-identity/package.json`:

```json
{
  "name": "@openbroca/app-identity",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "get-windows": "^9.3.0"
  },
  "devDependencies": {
    "@openbroca/typescript-config": "workspace:*",
    "@types/node": "^22.19.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.2"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `packages/app-identity/tsconfig.json`:

```json
{
  "extends": "@openbroca/typescript-config/node.json",
  "include": ["src/**/*.ts"]
}
```

Create `packages/app-identity/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node'
  }
})
```

- [ ] **Step 5: Implement the contracts and normalization helpers**

Create `packages/app-identity/src/contracts.ts`:

```ts
export type AppPlatform = 'macos' | 'windows'
export type AppIdentitySource = 'detected' | 'manual'

export type AppIdentity = {
  id: string
  displayName: string
  platform: AppPlatform
  bundleId?: string
  aumid?: string
  path?: string
  iconDataUrl?: string
  source: AppIdentitySource
}

export type RawAppIdentity = Omit<AppIdentity, 'id'> & { id?: string }
```

Create `packages/app-identity/src/normalize.ts`:

```ts
import type { AppIdentity, RawAppIdentity } from './contracts'

function normalizeText(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

export function normalizeDetectedAppIdentity(raw: RawAppIdentity): AppIdentity {
  const platform = raw.platform
  const bundleId = normalizeText(raw.bundleId)
  const aumid = normalizeText(raw.aumid)
  const path = normalizeText(raw.path)
  const displayName = normalizeText(raw.displayName) ?? 'Unknown App'
  const id =
    normalizeText(raw.id) ??
    (platform === 'macos' ? bundleId : undefined) ??
    (platform === 'windows' ? aumid : undefined) ??
    path

  if (!id) {
    throw new Error(`Unable to derive stable app id for ${displayName}`)
  }

  return {
    id,
    displayName,
    platform,
    bundleId,
    aumid,
    path,
    iconDataUrl: normalizeText(raw.iconDataUrl),
    source: raw.source
  }
}

export function dedupeAppIdentities(items: AppIdentity[]): AppIdentity[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
```

Create `packages/app-identity/src/manual.ts`:

```ts
import type { AppIdentity } from './contracts'

export function normalizeManualAppIdentity(input: {
  displayName: string
  platform: 'macos' | 'windows'
  stableId: string
  bundleId?: string
  aumid?: string
  path?: string
}): AppIdentity {
  const id = input.stableId.trim()
  if (!id) {
    throw new Error('Manual app entry requires a stable id')
  }

  return {
    id,
    displayName: input.displayName.trim() || id,
    platform: input.platform,
    bundleId: input.bundleId?.trim() || undefined,
    aumid: input.aumid?.trim() || undefined,
    path: input.path?.trim() || undefined,
    source: 'manual'
  }
}
```

Create `packages/app-identity/src/index.ts`:

```ts
export * from './contracts'
export * from './normalize'
export * from './manual'
```

Update `apps/desktop/package.json` dependencies:

```json
"@openbroca/app-identity": "workspace:*"
```

- [ ] **Step 6: Run the new package tests and verify they pass**

Run:

```bash
pnpm --filter @openbroca/app-identity test
```

Expected: PASS with the two package test files green.

- [ ] **Step 7: Commit the package scaffold**

Run:

```bash
git add packages/app-identity apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(app-identity): add shared identity package"
```

---

### Task 2: Add Cross-Platform Discovery And Main-Process App Identity Service

**Files:**
- Create: `packages/app-identity/src/discovery.ts`
- Create: `packages/app-identity/src/platform/macos.ts`
- Create: `packages/app-identity/src/platform/windows.ts`
- Create: `packages/app-identity/src/__tests__/discovery.test.ts`
- Create: `apps/desktop/src/main/app-identity/service.ts`
- Create: `apps/desktop/src/main/__tests__/app-identity-service.test.ts`
- Modify: `apps/desktop/src/main/trpc/context.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write the failing discovery orchestration test**

Create `packages/app-identity/src/__tests__/discovery.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createDiscoveryClient } from '../discovery'

describe('createDiscoveryClient', () => {
  test('dedupes detected app results and normalizes the frontmost app', async () => {
    const client = createDiscoveryClient({
      platform: 'windows',
      listDetectedApps: vi.fn().mockResolvedValue([
        {
          displayName: 'Chrome',
          platform: 'windows',
          path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
          source: 'detected'
        },
        {
          displayName: 'Google Chrome',
          platform: 'windows',
          path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
          source: 'detected'
        }
      ]),
      getDetectedFrontmostApp: vi.fn().mockResolvedValue({
        displayName: 'Chrome',
        platform: 'windows',
        path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
        source: 'detected'
      })
    })

    await expect(client.listApps()).resolves.toHaveLength(1)
    await expect(client.getFrontmostApp()).resolves.toMatchObject({
      id: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
      displayName: 'Chrome'
    })
  })
})
```

- [ ] **Step 2: Run the targeted discovery test and verify it fails**

Run:

```bash
pnpm vitest run packages/app-identity/src/__tests__/discovery.test.ts
```

Expected: FAIL because discovery entry points do not exist yet.

- [ ] **Step 3: Implement discovery entry points with injectable platform adapters**

Create `packages/app-identity/src/discovery.ts`:

```ts
import type { AppIdentity, AppPlatform, RawAppIdentity } from './contracts'
import { dedupeAppIdentities, normalizeDetectedAppIdentity } from './normalize'

type DiscoveryOptions = {
  platform: AppPlatform
  listDetectedApps: () => Promise<RawAppIdentity[]>
  getDetectedFrontmostApp: () => Promise<RawAppIdentity | null>
}

export function createDiscoveryClient(options: DiscoveryOptions) {
  return {
    async listApps(): Promise<AppIdentity[]> {
      const raw = await options.listDetectedApps()
      return dedupeAppIdentities(raw.map(normalizeDetectedAppIdentity)).sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      )
    },
    async getFrontmostApp(): Promise<AppIdentity | null> {
      const raw = await options.getDetectedFrontmostApp()
      return raw ? normalizeDetectedAppIdentity(raw) : null
    }
  }
}
```

Create `packages/app-identity/src/platform/macos.ts` with a narrow first version:

```ts
import { readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { activeWindow } from 'get-windows'
import type { RawAppIdentity } from '../contracts'

export async function listMacApps(): Promise<RawAppIdentity[]> {
  const roots = ['/Applications', path.join(os.homedir(), 'Applications')]
  const results: RawAppIdentity[] = []

  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue
        const appPath = path.join(root, entry.name)
        results.push({
          displayName: entry.name.replace(/\\.app$/u, ''),
          platform: 'macos',
          path: appPath,
          source: 'detected'
        })
      }
    } catch {}
  }

  return results
}

export async function getMacFrontmostApp(): Promise<RawAppIdentity | null> {
  const window = await activeWindow()
  if (!window?.owner?.path) return null

  return {
    displayName: window.owner.name ?? window.title ?? window.owner.path,
    platform: 'macos',
    bundleId: window.owner.bundleId ?? undefined,
    path: window.owner.path,
    source: 'detected'
  }
}
```

Create `packages/app-identity/src/platform/windows.ts` with a running-app-plus-start-menu first version:

```ts
import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { activeWindow, openWindows } from 'get-windows'
import type { RawAppIdentity } from '../contracts'

const execFile = promisify(nodeExecFile)

export async function listWindowsApps(): Promise<RawAppIdentity[]> {
  const runningApps = (await openWindows())
    .map((item) => item.owner)
    .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner?.path))
    .map((owner) => ({
      displayName: owner.name ?? owner.path.split('\\\\').pop() ?? owner.path,
      platform: 'windows' as const,
      path: owner.path,
      aumid: owner.id ?? undefined,
      source: 'detected' as const
    }))

  const { stdout } = await execFile('powershell', [
    '-NoProfile',
    '-Command',
    'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json'
  ])

  const startApps = JSON.parse(stdout || '[]') as Array<{ Name?: string; AppID?: string }>

  return [
    ...runningApps,
    ...startApps
      .filter((item) => item.AppID)
      .map((item) => ({
        displayName: item.Name ?? item.AppID ?? 'Unknown App',
        platform: 'windows' as const,
        aumid: item.AppID,
        source: 'detected' as const
      }))
  ]
}

export async function getWindowsFrontmostApp(): Promise<RawAppIdentity | null> {
  const window = await activeWindow()
  if (!window?.owner?.path) return null

  return {
    displayName: window.owner.name ?? window.title ?? window.owner.path,
    platform: 'windows',
    path: window.owner.path,
    aumid: window.owner.id ?? undefined,
    source: 'detected'
  }
}
```

Update `packages/app-identity/src/index.ts`:

```ts
export * from './discovery'
export * from './platform/macos'
export * from './platform/windows'
```

- [ ] **Step 4: Write the failing main-process service test**

Create `apps/desktop/src/main/__tests__/app-identity-service.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { AppIdentityService } from '../app-identity/service'

describe('AppIdentityService', () => {
  test('hydrates icons onto discovered app identities', async () => {
    const service = new AppIdentityService({
      listApps: vi.fn().mockResolvedValue([
        {
          id: 'com.todesktop.230313mzl4w4u92',
          displayName: 'Cursor',
          platform: 'macos',
          path: '/Applications/Cursor.app',
          source: 'detected'
        }
      ]),
      getFrontmostApp: vi.fn().mockResolvedValue(null),
      resolveIconDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,abc')
    })

    await expect(service.listApps()).resolves.toEqual([
      expect.objectContaining({
        iconDataUrl: 'data:image/png;base64,abc'
      })
    ])
  })
})
```

- [ ] **Step 5: Run the targeted service test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/app-identity-service.test.ts
```

Expected: FAIL because the service does not exist yet.

- [ ] **Step 6: Implement the Electron-facing app identity service and inject it into main**

Create `apps/desktop/src/main/app-identity/service.ts`:

```ts
import type { AppIdentity } from '@openbroca/app-identity'

type ServiceDeps = {
  listApps: () => Promise<AppIdentity[]>
  getFrontmostApp: () => Promise<AppIdentity | null>
  resolveIconDataUrl: (path?: string) => Promise<string | undefined>
}

export class AppIdentityService {
  constructor(private readonly deps: ServiceDeps) {}

  async listApps(): Promise<AppIdentity[]> {
    const apps = await this.deps.listApps()
    return Promise.all(
      apps.map(async (item) => ({
        ...item,
        iconDataUrl: item.iconDataUrl ?? (await this.deps.resolveIconDataUrl(item.path))
      }))
    )
  }

  async getFrontmostApp(): Promise<AppIdentity | null> {
    const item = await this.deps.getFrontmostApp()
    if (!item) return null
    return {
      ...item,
      iconDataUrl: item.iconDataUrl ?? (await this.deps.resolveIconDataUrl(item.path))
    }
  }
}
```

Update `apps/desktop/src/main/trpc/context.ts`:

```ts
import type { AppIdentityService } from '../app-identity/service'

export interface Context {
  // ...
  appIdentityService: AppIdentityService
}
```

Update `apps/desktop/src/main/index.ts` to construct the service:

```ts
import { app, nativeImage } from 'electron'
import { AppIdentityService } from './app-identity/service'
import { createDiscoveryClient, getMacFrontmostApp, getWindowsFrontmostApp, listWindowsApps, listMacApps } from '@openbroca/app-identity'

const discoveryClient =
  process.platform === 'darwin'
    ? createDiscoveryClient({
        platform: 'macos',
        listDetectedApps: listMacApps,
        getDetectedFrontmostApp: getMacFrontmostApp
      })
    : createDiscoveryClient({
        platform: 'windows',
        listDetectedApps: listWindowsApps,
        getDetectedFrontmostApp: getWindowsFrontmostApp
      })

const appIdentityService = new AppIdentityService({
  listApps: () => discoveryClient.listApps(),
  getFrontmostApp: () => discoveryClient.getFrontmostApp(),
  resolveIconDataUrl: async (filePath) => {
    if (!filePath) return undefined
    const icon = await app.getFileIcon(filePath)
    return icon.isEmpty() ? undefined : icon.toDataURL()
  }
})
```

- [ ] **Step 7: Run the package and main service tests and verify they pass**

Run:

```bash
pnpm --filter @openbroca/app-identity test
pnpm vitest run apps/desktop/src/main/__tests__/app-identity-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the discovery layer**

Run:

```bash
git add packages/app-identity apps/desktop/src/main/app-identity/service.ts apps/desktop/src/main/trpc/context.ts apps/desktop/src/main/index.ts apps/desktop/src/main/__tests__/app-identity-service.test.ts
git commit -m "feat(app-identity): add discovery service"
```

---

### Task 3: Add Desktop Instruction Schema, Persisted Store, And Matching Logic

**Files:**
- Create: `apps/desktop/src/shared/instructions.ts`
- Create: `apps/desktop/src/renderer/src/stores/instructions-store.ts`
- Create: `apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts`
- Create: `apps/desktop/src/main/instructions/matcher.ts`
- Create: `apps/desktop/src/main/__tests__/instructions-matcher.test.ts`
- Modify: `apps/desktop/src/main/store/schema.ts`
- Modify: `apps/desktop/src/main/store/instance.ts`
- Modify: `apps/desktop/src/main/trpc/routers/store.ts`
- Modify: `apps/desktop/src/main/trpc/routers/__tests__/store.test.ts`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Write the failing store normalization test for duplicate app ownership**

Create `apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { trpcClient } from '../../trpc/client'

const storeWatchSubscribeMock = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
const storeGetQueryMock = vi.fn()

vi.mock('../../trpc/client', () => ({
  trpcClient: {
    store: {
      get: { query: storeGetQueryMock },
      set: { mutate: vi.fn().mockResolvedValue(undefined) },
      watch: { subscribe: storeWatchSubscribeMock }
    }
  }
}))

describe('instructionsStore', () => {
  beforeEach(() => {
    vi.resetModules()
    storeGetQueryMock.mockReset()
  })

  test('drops later duplicate activation apps during hydration', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      rules: [
        {
          id: 'rule-a',
          name: 'Email',
          activationApps: [{ id: 'com.superhuman.mail', displayName: 'Superhuman', platform: 'macos', source: 'detected' }],
          customInstructions: '',
          autoEnter: false,
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:00:00.000Z'
        },
        {
          id: 'rule-b',
          name: 'Duplicate',
          activationApps: [{ id: 'com.superhuman.mail', displayName: 'Superhuman', platform: 'macos', source: 'detected' }],
          customInstructions: '',
          autoEnter: true,
          createdAt: '2026-04-03T00:00:00.000Z',
          updatedAt: '2026-04-03T00:00:00.000Z'
        }
      ]
    })

    const { instructionsStore } = await import('../instructions-store')
    await instructionsStore.getState().hydrate()

    expect(instructionsStore.getState().data.rules).toHaveLength(1)
    expect(instructionsStore.getState().data.rules[0]?.id).toBe('rule-a')
  })
})
```

- [ ] **Step 2: Write the failing matcher test**

Create `apps/desktop/src/main/__tests__/instructions-matcher.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createInstructionMatcher } from '../instructions/matcher'

describe('createInstructionMatcher', () => {
  test('returns the unique matched rule for the current frontmost app', async () => {
    const matcher = createInstructionMatcher({
      getInstructions: () => ({
        rules: [
          {
            id: 'cursor-rule',
            name: 'Cursor',
            activationApps: [
              {
                id: 'com.todesktop.230313mzl4w4u92',
                displayName: 'Cursor',
                platform: 'macos',
                source: 'detected'
              }
            ],
            customInstructions: 'Be terse and code-first.',
            autoEnter: true,
            createdAt: '2026-04-03T00:00:00.000Z',
            updatedAt: '2026-04-03T00:00:00.000Z'
          }
        ]
      }),
      getFrontmostApp: vi.fn().mockResolvedValue({
        id: 'com.todesktop.230313mzl4w4u92',
        displayName: 'Cursor',
        platform: 'macos',
        source: 'detected'
      })
    })

    await expect(matcher.resolve()).resolves.toEqual({
      ruleId: 'cursor-rule',
      name: 'Cursor',
      customInstructions: 'Be terse and code-first.',
      autoEnter: true
    })
  })
})
```

- [ ] **Step 3: Run the targeted tests and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts apps/desktop/src/main/__tests__/instructions-matcher.test.ts
```

Expected: FAIL because the instruction schema and store do not exist yet.

- [ ] **Step 4: Implement the desktop-only shared instruction schema**

Create `apps/desktop/src/shared/instructions.ts`:

```ts
import type { AppIdentity } from '@openbroca/app-identity'

export type InstructionActivationApp = AppIdentity

export type InstructionRule = {
  id: string
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnter: boolean
  createdAt: string
  updatedAt: string
}

export type InstructionsSettings = {
  rules: InstructionRule[]
}

export const defaultInstructionsSettings: InstructionsSettings = {
  rules: []
}

export function normalizeInstructionsSettings(raw: unknown): InstructionsSettings {
  const rules = Array.isArray((raw as { rules?: unknown[] } | null)?.rules)
    ? ((raw as { rules: unknown[] }).rules as InstructionRule[])
    : []

  const claimedApps = new Set<string>()
  const normalizedRules: InstructionRule[] = []

  for (const rule of rules) {
    const name = rule.name?.trim()
    if (!name) continue

    const activationApps = (rule.activationApps ?? []).filter((app) => {
      if (!app?.id || claimedApps.has(app.id)) return false
      claimedApps.add(app.id)
      return true
    })

    normalizedRules.push({
      id: rule.id,
      name,
      activationApps,
      customInstructions: rule.customInstructions ?? '',
      autoEnter: Boolean(rule.autoEnter),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    })
  }

  return { rules: normalizedRules }
}
```

- [ ] **Step 5: Implement the renderer store and store-schema wiring**

Create `apps/desktop/src/renderer/src/stores/instructions-store.ts`:

```ts
import {
  defaultInstructionsSettings,
  normalizeInstructionsSettings,
  type InstructionsSettings
} from '../../../shared/instructions'
import { createPersistedStore } from './create-persisted-store'

export { defaultInstructionsSettings, type InstructionsSettings }

export const instructionsStore = createPersistedStore<InstructionsSettings>({
  key: 'instructions',
  defaults: defaultInstructionsSettings,
  normalize: normalizeInstructionsSettings
})
```

Update `apps/desktop/src/main/store/schema.ts`:

```ts
import type { InstructionsSettings } from '../../shared/instructions'

export interface StoreSchema {
  // ...
  instructions: InstructionsSettings
}
```

Update `apps/desktop/src/main/store/instance.ts` defaults:

```ts
import { defaultInstructionsSettings } from '../../shared/instructions'

defaults: {
  // ...
  instructions: defaultInstructionsSettings
}
```

Update `apps/desktop/src/main/trpc/routers/store.ts`:

```ts
const allowedStoreKeys = new Set([
  'aboutMe',
  'dictionary',
  'providers',
  'instructions',
  'settings',
  'microphone',
  'shortcuts'
])
```

Update `apps/desktop/src/renderer/src/stores/index.ts`:

```ts
export { instructionsStore } from './instructions-store'
export type { InstructionsSettings } from './instructions-store'
```

- [ ] **Step 6: Implement the main matcher helper**

Create `apps/desktop/src/main/instructions/matcher.ts`:

```ts
import type { AppIdentity } from '@openbroca/app-identity'
import type { InstructionsSettings } from '../../shared/instructions'

export function createInstructionMatcher(deps: {
  getInstructions: () => InstructionsSettings
  getFrontmostApp: () => Promise<AppIdentity | null>
}) {
  return {
    async resolve(): Promise<{
      ruleId: string
      name: string
      customInstructions: string
      autoEnter: boolean
    } | null> {
      const app = await deps.getFrontmostApp()
      if (!app) return null

      const match = deps
        .getInstructions()
        .rules.find((rule) => rule.activationApps.some((candidate) => candidate.id === app.id))

      return match
        ? {
            ruleId: match.id,
            name: match.name,
            customInstructions: match.customInstructions,
            autoEnter: match.autoEnter
          }
        : null
    }
  }
}
```

- [ ] **Step 7: Run the targeted tests and verify they pass**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts apps/desktop/src/main/__tests__/instructions-matcher.test.ts apps/desktop/src/main/trpc/routers/__tests__/store.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the schema and matcher**

Run:

```bash
git add apps/desktop/src/shared/instructions.ts apps/desktop/src/renderer/src/stores/instructions-store.ts apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts apps/desktop/src/main/instructions/matcher.ts apps/desktop/src/main/__tests__/instructions-matcher.test.ts apps/desktop/src/main/store/schema.ts apps/desktop/src/main/store/instance.ts apps/desktop/src/main/trpc/routers/store.ts apps/desktop/src/main/trpc/routers/__tests__/store.test.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(instructions): add persisted instruction schema"
```

---

### Task 4: Expose App Catalog Data To The Renderer Through TRPC

**Files:**
- Create: `apps/desktop/src/main/trpc/routers/app-identity.ts`
- Modify: `apps/desktop/src/main/trpc/router.ts`
- Modify: `apps/desktop/src/main/trpc/context.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write the failing app-identity router test**

Create `apps/desktop/src/main/__tests__/app-identity-router.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { appIdentityRouter } from '../trpc/routers/app-identity'

describe('appIdentityRouter', () => {
  test('returns the discovered app catalog', async () => {
    const caller = appIdentityRouter.createCaller({
      appIdentityService: {
        listApps: vi.fn().mockResolvedValue([
          {
            id: 'com.todesktop.230313mzl4w4u92',
            displayName: 'Cursor',
            platform: 'macos',
            source: 'detected'
          }
        ]),
        getFrontmostApp: vi.fn().mockResolvedValue(null)
      }
    } as never)

    await expect(caller.listApps()).resolves.toEqual([
      expect.objectContaining({ displayName: 'Cursor' })
    ])
  })
})
```

- [ ] **Step 2: Run the targeted router test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/app-identity-router.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Implement the TRPC router and register it**

Create `apps/desktop/src/main/trpc/routers/app-identity.ts`:

```ts
import { publicProcedure, router } from '../trpc'

export const appIdentityRouter = router({
  listApps: publicProcedure.query(({ ctx }) => ctx.appIdentityService.listApps()),
  frontmost: publicProcedure.query(({ ctx }) => ctx.appIdentityService.getFrontmostApp())
})
```

Update `apps/desktop/src/main/trpc/router.ts`:

```ts
import { appIdentityRouter } from './routers/app-identity'

export const appTrpcRouter = router({
  app: appRouter,
  appIdentity: appIdentityRouter,
  store: storeRouter,
  providers: providersRouter,
  audio: audioRouter,
  providerAuth: providerAuthRouter,
  history: historyRouter
})
```

Update `apps/desktop/src/main/index.ts` context creation:

```ts
createContext(
  mainWindow,
  store,
  llmRegistry,
  asrRegistry,
  captureSource,
  oauthService,
  historyRepository,
  appIdentityService
)
```

- [ ] **Step 4: Run the router test and a typecheck sweep**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/app-identity-router.test.ts apps/desktop/src/main/__tests__/app-identity-service.test.ts
pnpm --filter desktop typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the TRPC route**

Run:

```bash
git add apps/desktop/src/main/trpc/routers/app-identity.ts apps/desktop/src/main/trpc/router.ts apps/desktop/src/main/trpc/context.ts apps/desktop/src/main/index.ts apps/desktop/src/main/__tests__/app-identity-router.test.ts
git commit -m "feat(desktop): expose app identity catalog"
```

---

### Task 5: Build The `Instructions` Grid-And-Card UI With Shadcn Components

**Files:**
- Create: `apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx`
- Create: `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
- Create: `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`
- Create: `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`
- Create: `apps/desktop/src/renderer/src/pages/main/instructions.tsx`
- Create: `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
- Modify: `apps/desktop/src/renderer/src/router/index.tsx`

- [ ] **Step 1: Write the failing instructions page test**

Create `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
// @vitest-environment jsdom

import React from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'

const instructionsStore = createStore(() => ({
  data: {
    rules: [
      {
        id: 'cursor-rule',
        name: 'Cursor',
        activationApps: [
          {
            id: 'com.todesktop.230313mzl4w4u92',
            displayName: 'Cursor',
            platform: 'macos',
            source: 'detected'
          }
        ],
        customInstructions: 'Prefer code blocks.',
        autoEnter: true,
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z'
      }
    ]
  },
  isHydrated: true,
  update: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  hydrate: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@renderer/stores/instructions-store', () => ({
  instructionsStore
}))

vi.mock('@renderer/trpc', () => ({
  trpc: {
    appIdentity: {
      listApps: {
        useQuery: () => ({
          data: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            },
            {
              id: 'com.openai.chatgpt',
              displayName: 'ChatGPT',
              platform: 'macos',
              source: 'detected'
            }
          ],
          isLoading: false,
          error: null
        })
      }
    }
  }
}))

describe('Instructions', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()
  })

  test('renders instruction cards in a responsive grid and opens the editor dialog', async () => {
    const { Instructions } = await import('../instructions')
    const { container } = render(<Instructions />)

    expect(container.querySelector('[data-testid=\"instructions-grid\"]')).toBeTruthy()
    expect(screen.getByText('Cursor')).toBeTruthy()
    expect(screen.getByText('Prefer code blocks.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run the targeted page test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx
```

Expected: FAIL because the route page and components do not exist.

- [ ] **Step 3: Implement the card and dialog components with shadcn primitives**

Create `apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx`:

```tsx
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@openbroca/ui'
import type { InstructionRule } from '../../../../shared/instructions'

export function InstructionCard(props: {
  rule: InstructionRule
  onEdit: () => void
  onDelete: () => void
}) {
  const preview = props.rule.customInstructions.trim() || 'No custom instructions.'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>{props.rule.name}</CardTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{props.rule.activationApps.length} apps</Badge>
            {props.rule.autoEnter ? <Badge>Auto enter</Badge> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={props.onEdit}>Edit</Button>
          <Button variant="ghost" onClick={props.onDelete}>Delete</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{preview}</p>
        <div className="flex flex-wrap gap-2">
          {props.rule.activationApps.map((app) => (
            <Badge key={app.id} variant="outline">{app.displayName}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

Create `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx` around shadcn `Dialog`, `Input`, `Textarea`, `Switch`, and the activation picker:

```tsx
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Switch, Textarea } from '@openbroca/ui'
import React from 'react'

export function InstructionEditorDialog(props: {
  open: boolean
  rule: InstructionRule | null
  rules: InstructionRule[]
  availableApps: AppIdentity[]
  onOpenChange: (open: boolean) => void
  onSave: (rule: InstructionRule) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [activationApps, setActivationApps] = React.useState<AppIdentity[]>([])
  const [customInstructions, setCustomInstructions] = React.useState('')
  const [autoEnter, setAutoEnter] = React.useState(false)

  React.useEffect(() => {
    if (!props.open) return
    setName(props.rule?.name ?? '')
    setActivationApps(props.rule?.activationApps ?? [])
    setCustomInstructions(props.rule?.customInstructions ?? '')
    setAutoEnter(props.rule?.autoEnter ?? false)
  }, [props.open, props.rule])

  const claimedAppIds = new Map(
    props.rules
      .filter((candidate) => candidate.id !== props.rule?.id)
      .flatMap((candidate) =>
        candidate.activationApps.map((app) => [app.id, candidate.name] as const)
      )
  )

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.rule ? 'Edit instruction' : 'New instruction'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instruction-name">Name</Label>
            <Input id="instruction-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <ActivationAppPicker
            value={activationApps}
            availableApps={props.availableApps}
            claimedAppIds={claimedAppIds}
            onChange={setActivationApps}
          />
          <div className="space-y-2">
            <Label htmlFor="instruction-custom">Custom instructions</Label>
            <Textarea
              id="instruction-custom"
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Auto enter</p>
              <p className="text-sm text-muted-foreground">
                Simulates pressing a send key after processing.
              </p>
            </div>
            <Switch checked={autoEnter} onCheckedChange={setAutoEnter} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              void props.onSave({
                id: props.rule?.id ?? crypto.randomUUID(),
                name: name.trim(),
                activationApps,
                customInstructions,
                autoEnter,
                createdAt: props.rule?.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Create `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`:

```tsx
import { Badge, Button, Command, CommandInput, CommandItem, CommandList } from '@openbroca/ui'
import React from 'react'

export function ActivationAppPicker(props: {
  value: AppIdentity[]
  availableApps: AppIdentity[]
  claimedAppIds: Map<string, string>
  onChange: (apps: AppIdentity[]) => void
}) {
  const [isManualOpen, setIsManualOpen] = React.useState(false)

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Activation apps</Label>
        <Command className="rounded-lg border">
          <CommandInput placeholder="Search apps" />
          <CommandList>
            {props.availableApps.map((app) => {
              const owner = props.claimedAppIds.get(app.id)
              const isSelected = props.value.some((candidate) => candidate.id === app.id)
              return (
                <CommandItem
                  key={app.id}
                  disabled={Boolean(owner)}
                  onSelect={() => {
                    if (!owner && !isSelected) {
                      props.onChange([...props.value, app])
                    }
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="truncate">{app.displayName}</span>
                    {owner ? <span className="text-xs text-muted-foreground">Used by {owner}</span> : null}
                  </div>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </div>

      <div className="flex flex-wrap gap-2">
        {props.value.map((app) => (
          <Badge key={app.id} variant="secondary" className="gap-2">
            {app.displayName}
            <button type="button" onClick={() => props.onChange(props.value.filter((candidate) => candidate.id !== app.id))}>
              Remove
            </button>
          </Badge>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={() => setIsManualOpen(true)}>
        Manual entry
      </Button>

      <ManualAppDialog
        open={isManualOpen}
        onOpenChange={setIsManualOpen}
        onSave={(app) => props.onChange([...props.value, app])}
      />
    </div>
  )
}
```

Create `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`:

```tsx
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@openbroca/ui'
import React from 'react'
import { normalizeManualAppIdentity } from '@openbroca/app-identity'

export function ManualAppDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (app: AppIdentity) => void
}) {
  const [displayName, setDisplayName] = React.useState('')
  const [platform, setPlatform] = React.useState<'macos' | 'windows'>('macos')
  const [stableId, setStableId] = React.useState('')
  const [bundleId, setBundleId] = React.useState('')
  const [aumid, setAumid] = React.useState('')
  const [path, setPath] = React.useState('')

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual app entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <Select value={platform} onValueChange={(value) => setPlatform(value as 'macos' | 'windows')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="macos">macOS</SelectItem>
              <SelectItem value="windows">Windows</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Stable ID" value={stableId} onChange={(event) => setStableId(event.target.value)} />
          <Input placeholder="Bundle ID (optional)" value={bundleId} onChange={(event) => setBundleId(event.target.value)} />
          <Input placeholder="AUMID (optional)" value={aumid} onChange={(event) => setAumid(event.target.value)} />
          <Input placeholder="Path (optional)" value={path} onChange={(event) => setPath(event.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!stableId.trim()}
            onClick={() => {
              props.onSave(
                normalizeManualAppIdentity({
                  displayName,
                  platform,
                  stableId,
                  bundleId,
                  aumid,
                  path
                })
              )
              props.onOpenChange(false)
            }}
          >
            Add app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Implement the `Instructions` page and route**

Create `apps/desktop/src/renderer/src/pages/main/instructions.tsx`:

```tsx
import React from 'react'
import { Button, TypographyH3, TypographyMuted } from '@openbroca/ui'
import { useStore } from 'zustand'
import { trpc } from '@renderer/trpc'
import { instructionsStore } from '@renderer/stores/instructions-store'
import { InstructionCard } from '@renderer/components/instructions/instruction-card'
import { InstructionEditorDialog } from '@renderer/components/instructions/instruction-editor-dialog'

export const Instructions: React.FC = () => {
  const { data, replace, isHydrated } = useStore(instructionsStore)
  const catalog = trpc.appIdentity.listApps.useQuery()
  const [editingRuleId, setEditingRuleId] = React.useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = React.useState(false)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <TypographyH3 className="text-left">Instructions</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Create app-specific rules that customize cleanup behavior and optionally auto-send after processing.
          </TypographyMuted>
        </div>
        <Button onClick={() => setIsEditorOpen(true)}>New instruction</Button>
      </div>

      <div
        data-testid="instructions-grid"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {data.rules.map((rule) => (
          <InstructionCard
            key={rule.id}
            rule={rule}
            onEdit={() => {
              setEditingRuleId(rule.id)
              setIsEditorOpen(true)
            }}
            onDelete={() =>
              void replace({ rules: data.rules.filter((candidate) => candidate.id !== rule.id) })
            }
          />
        ))}
      </div>

      <InstructionEditorDialog
        open={isEditorOpen}
        availableApps={catalog.data ?? []}
        rules={data.rules}
        rule={data.rules.find((rule) => rule.id === editingRuleId) ?? null}
        onOpenChange={(next) => {
          setIsEditorOpen(next)
          if (!next) setEditingRuleId(null)
        }}
        onSave={async (nextRule) => {
          const remaining = data.rules.filter((rule) => rule.id !== nextRule.id)
          await replace({ rules: [...remaining, nextRule] })
          setIsEditorOpen(false)
          setEditingRuleId(null)
        }}
      />
    </div>
  )
}
```

Update `apps/desktop/src/renderer/src/router/index.tsx`:

```tsx
import { Instructions } from '@renderer/pages/main/instructions'

children: [
  { index: true, Component: Dashboard },
  { path: 'instructions', Component: Instructions },
  { path: 'providers', Component: Providers },
  // ...
]
```

- [ ] **Step 5: Run the page test and a renderer typecheck**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx
pnpm --filter desktop typecheck:web
```

Expected: PASS.

- [ ] **Step 6: Commit the instructions UI**

Run:

```bash
git add apps/desktop/src/renderer/src/components/instructions apps/desktop/src/renderer/src/pages/main/instructions.tsx apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx apps/desktop/src/renderer/src/router/index.tsx
git commit -m "feat(desktop): add instructions page"
```

---

### Task 6: Feed Matched Instructions Into The Pipeline And Trigger Auto-Enter

**Files:**
- Create: `apps/desktop/src/main/send-key/auto-enter.ts`
- Create: `apps/desktop/src/main/__tests__/auto-enter.test.ts`
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write the failing auto-enter service test**

Create `apps/desktop/src/main/__tests__/auto-enter.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createAutoEnterService } from '../send-key/auto-enter'

describe('createAutoEnterService', () => {
  test('runs the macOS enter key command', async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const service = createAutoEnterService({ platform: 'darwin', execFile })

    await service.pressEnter()

    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell application \"System Events\" to key code 36']
    )
  })
})
```

- [ ] **Step 2: Extend the pipeline test to assert custom instructions and auto-enter**

Add to `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`:

```ts
test('appends matched custom instructions and triggers auto enter when enabled', async () => {
  const repository = {
    create: vi.fn(() => ({ id: 'record-instruction' })),
    update: vi.fn()
  }
  const storage = {
    save: vi.fn().mockResolvedValue({
      audioFilePath: '/recordings/instruction.wav',
      fileName: 'instruction.wav',
      byteLength: 64
    })
  }
  const asrProvider = {
    id: 'deepgram',
    displayName: 'Deepgram',
    recognize: vi.fn().mockResolvedValue({
      text: 'draft an update',
      segments: [{ text: 'draft an update', isFinal: true }]
    })
  }
  const llmProvider = {
    id: 'openai',
    displayName: 'OpenAI',
    generate: vi.fn().mockResolvedValue({
      content: 'Drafted update.',
      finishReason: 'stop',
      usage: undefined
    })
  }
  const triggerAutoEnter = vi.fn().mockResolvedValue(undefined)

  const pipeline = new PostRecordingPipeline({
    historyRepository: repository as never,
    recordingStorage: storage as never,
    resolveActiveASRProvider: vi.fn().mockResolvedValue(asrProvider),
    resolveActiveLLMSelection: vi.fn().mockResolvedValue({ provider: llmProvider as never, model: 'gpt-4.1' }),
    resolveMatchedInstruction: vi.fn().mockResolvedValue({
      ruleId: 'cursor-rule',
      name: 'Cursor',
      customInstructions: 'Keep the answer concise and code-oriented.',
      autoEnter: true
    }),
    triggerAutoEnter
  })

  await pipeline.process({
    format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
    chunks: [new Uint8Array([1, 2])],
    startedAt: '2026-04-03T10:00:00.000Z',
    endedAt: '2026-04-03T10:00:01.000Z',
    durationMs: 1000
  })

  const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
  expect(llmRequest.messages[0].content).toContain('Clean up the dictated transcript')
  expect(llmRequest.messages[0].content).toContain('Keep the answer concise and code-oriented.')
  expect(triggerAutoEnter).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Run the targeted tests and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/auto-enter.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts -t "auto enter"
```

Expected: FAIL because the service and new pipeline hooks do not exist.

- [ ] **Step 4: Implement the auto-enter service**

Create `apps/desktop/src/main/send-key/auto-enter.ts`:

```ts
import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(nodeExecFile)

export function createAutoEnterService(deps: {
  platform: NodeJS.Platform
  execFile?: typeof execFile
}) {
  const run = deps.execFile ?? execFile

  return {
    async pressEnter(): Promise<void> {
      if (deps.platform === 'darwin') {
        await run('osascript', ['-e', 'tell application "System Events" to key code 36'])
        return
      }

      if (deps.platform === 'win32') {
        await run('powershell', [
          '-NoProfile',
          '-Command',
          '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("{ENTER}")'
        ])
      }
    }
  }
}
```

- [ ] **Step 5: Update the pipeline to consume the matched instruction**

Update the `PostRecordingPipeline` constructor dependencies:

```ts
resolveMatchedInstruction?: () => Promise<{
  ruleId: string
  name: string
  customInstructions: string
  autoEnter: boolean
} | null>
triggerAutoEnter?: () => Promise<void>
```

Update system prompt composition in `apps/desktop/src/main/post-recording-pipeline.ts`:

```ts
const matchedInstruction = await this.deps.resolveMatchedInstruction?.()
const systemPrompt = [cleanupPrompt, matchedInstruction?.customInstructions?.trim()]
  .filter((part): part is string => Boolean(part))
  .join('\n\n')

llmRequest = {
  model: llmModel,
  messages: [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: rawTranscriptionText
    }
  ]
}
```

After a successful LLM response:

```ts
if (matchedInstruction?.autoEnter) {
  await this.deps.triggerAutoEnter?.()
}
```

Also include matched-instruction metadata in the history debug patch:

```ts
debug: {
  matchedInstruction,
  llmRequest: { model: llmModel, messages: llmRequest.messages },
  // ...
}
```

- [ ] **Step 6: Wire the matcher and auto-enter service into main**

Update `apps/desktop/src/main/index.ts`:

```ts
import { createInstructionMatcher } from './instructions/matcher'
import { createAutoEnterService } from './send-key/auto-enter'
import { normalizeInstructionsSettings } from '../shared/instructions'

const instructionMatcher = createInstructionMatcher({
  getInstructions: () => normalizeInstructionsSettings(store.get('instructions')),
  getFrontmostApp: () => appIdentityService.getFrontmostApp()
})

const autoEnterService = createAutoEnterService({ platform: process.platform })

const postRecordingPipeline = new PostRecordingPipeline({
  historyRepository,
  recordingStorage,
  resolveActiveASRProvider,
  resolveActiveLLMSelection,
  resolveMatchedInstruction: () => instructionMatcher.resolve(),
  triggerAutoEnter: () => autoEnterService.pressEnter()
})
```

- [ ] **Step 7: Run the targeted main tests and the full desktop test suite**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/auto-enter.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/main/__tests__/instructions-matcher.test.ts
pnpm --filter desktop test
```

Expected: PASS.

- [ ] **Step 8: Commit the runtime integration**

Run:

```bash
git add apps/desktop/src/main/send-key/auto-enter.ts apps/desktop/src/main/__tests__/auto-enter.test.ts apps/desktop/src/main/post-recording-pipeline.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/main/index.ts
git commit -m "feat(desktop): apply matched instructions at runtime"
```

---

## Self-Review

- Spec coverage check:
  - shared app identity package: covered by Tasks 1-2
  - desktop instruction schema and unique app ownership: covered by Task 3
  - app catalog selection and manual entry UI: covered by Task 5
  - `/instructions` route, grid, cards, and shadcn: covered by Task 5
  - runtime matching and prompt/auto-enter wiring: covered by Task 6
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” markers remain
  - each task lists exact file paths and runnable commands
- Type consistency check:
  - shared package uses `AppIdentity`
  - desktop schema uses `InstructionRule` and `InstructionsSettings`
  - runtime matcher resolves `MatchedInstruction`-shaped data consumed by `PostRecordingPipeline`
