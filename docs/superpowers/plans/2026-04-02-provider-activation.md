# Provider Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit `activeProviders` state so the desktop app can connect multiple providers per category while keeping exactly one active LLM provider and one active ASR provider.

**Architecture:** Keep provider connection records and active provider selection separate under one persisted `providers` store key. Update the renderer store and provider page to read and write the new structured settings shape, then update main-process OAuth and runtime helpers to read the same shape and clear active selections when a connected provider disappears.

**Tech Stack:** React, Zustand, tRPC, Electron Store, TypeScript, Vitest, Testing Library

---

### Task 1: Introduce Structured Provider Settings and Legacy Normalization

**Files:**
- Modify: `apps/desktop/src/shared/provider-auth.ts`
- Modify: `apps/desktop/src/renderer/src/stores/create-persisted-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/provider-store.ts`
- Create: `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts`

- [ ] **Step 1: Write the failing normalization tests**

Create `apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts` with these tests:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'

describe('providerStore settings helpers', () => {
  afterEach(() => {
    vi.resetModules()
  })

  test('normalizes legacy flat provider records into structured settings', async () => {
    const legacy = {
      openai: {
        enabled: true,
        connectionType: 'apiKey' as const,
        config: { apiKey: 'sk-test' }
      }
    }

    const { normalizeProviderSettings } = await import('../provider-store')

    expect(normalizeProviderSettings(legacy)).toEqual({
      providers: legacy,
      activeProviders: {}
    })
  })

  test('preserves structured provider settings and backfills missing activeProviders', async () => {
    const current = {
      providers: {
        deepgram: {
          enabled: true,
          connectionType: 'apiKey' as const,
          config: { apiKey: 'dg-test' }
        }
      }
    }

    const { normalizeProviderSettings } = await import('../provider-store')

    expect(normalizeProviderSettings(current)).toEqual({
      providers: current.providers,
      activeProviders: {}
    })
  })

  test('clears active selections that point at missing provider ids', async () => {
    const { normalizeProviderSettings } = await import('../provider-store')

    expect(
      normalizeProviderSettings({
        providers: {
          openai: {
            enabled: true,
            connectionType: 'apiKey',
            config: { apiKey: 'sk-test' }
          }
        },
        activeProviders: {
          llm: 'missing-llm',
          asr: 'missing-asr'
        }
      })
    ).toEqual({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'sk-test' }
        }
      },
      activeProviders: {}
    })
  })
})
```

- [ ] **Step 2: Run the new store test and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts
```

Expected: FAIL because `normalizeProviderSettings` and the structured `ProviderSettings` shape do not exist yet.

- [ ] **Step 3: Implement the shared settings types, normalization helpers, and persisted-store hook**

Update `apps/desktop/src/shared/provider-auth.ts` to hold the shared persisted settings types so both renderer and main process use the same shape:

```ts
export interface ActiveProviders {
  llm?: string
  asr?: string
}

export interface ProviderSettings {
  providers: Record<string, ProviderConnectionRecord | undefined>
  activeProviders: ActiveProviders
}

export const defaultProviderSettings: ProviderSettings = {
  providers: {},
  activeProviders: {}
}

export function clearActiveProviderSelections(
  activeProviders: ActiveProviders,
  providerId: string
): ActiveProviders {
  return Object.fromEntries(
    Object.entries(activeProviders).filter(([, activeProviderId]) => activeProviderId !== providerId)
  ) as ActiveProviders
}

function sanitizeActiveProviders(
  providers: Record<string, ProviderConnectionRecord | undefined>,
  activeProviders: ActiveProviders | undefined
): ActiveProviders {
  return {
    ...(activeProviders?.llm && providers[activeProviders.llm] ? { llm: activeProviders.llm } : {}),
    ...(activeProviders?.asr && providers[activeProviders.asr] ? { asr: activeProviders.asr } : {})
  }
}

export function normalizeProviderSettings(raw: unknown): ProviderSettings {
  if (raw && typeof raw === 'object' && !('providers' in (raw as object))) {
    return {
      providers: raw as Record<string, ProviderConnectionRecord | undefined>,
      activeProviders: {}
    }
  }

  const candidate = raw as Partial<ProviderSettings> | null | undefined
  const providers = candidate?.providers ?? {}

  return {
    providers,
    activeProviders: sanitizeActiveProviders(providers, candidate?.activeProviders)
  }
}
```

Update `apps/desktop/src/renderer/src/stores/provider-store.ts` so it stops exporting a flat map and instead exports structured settings plus a normalization helper:

```ts
import {
  defaultProviderSettings,
  normalizeProviderSettings,
  type ActiveProviders,
  type ProviderConnectionRecord,
  type ProviderSettings
} from '../../../shared/provider-auth'

export {
  defaultProviderSettings,
  normalizeProviderSettings,
  type ActiveProviders,
  type ProviderConnectionRecord,
  type ProviderSettings
}

export const providerStore = createPersistedStore<ProviderSettings>({
  key: 'providers',
  defaults: defaultProviderSettings,
  normalize: normalizeProviderSettings
})
```

Update `apps/desktop/src/renderer/src/stores/create-persisted-store.ts` so store creation can normalize persisted raw values before hydrate or watch subscriptions write them into Zustand:

```ts
interface PersistedStoreConfig<T> {
  key: string
  defaults: T
  normalize?: (raw: unknown) => T
}

const normalize = config.normalize ?? ((raw: unknown) => ({ ...config.defaults, ...(raw as T) }))

// inside hydrate()
if (raw != null) {
  set({ data: normalize(raw), isHydrated: true })
}

// inside onData()
if (newValue != null) {
  zustandStore.setState({ data: normalize(newValue) })
}
```

Keep the normalization logic local to provider settings. Do not broaden this task into a generic migration framework beyond the optional `normalize` hook.

- [ ] **Step 4: Re-run the store test and verify it passes**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts
```

Expected: PASS with all three tests green.

- [ ] **Step 5: Commit the store-shape migration**

Run:

```bash
git add apps/desktop/src/shared/provider-auth.ts \
  apps/desktop/src/renderer/src/stores/create-persisted-store.ts \
  apps/desktop/src/renderer/src/stores/provider-store.ts \
  apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts
git commit -m "refactor(providers): normalize structured provider settings"
```

### Task 2: Add Renderer Activation UI and Disconnect Cleanup

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-section.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Modify: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write the failing renderer behavior tests**

Extend `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx` with these two tests and update the mocked store shape to use `{ providers: {}, activeProviders: {} }`:

```ts
test('shows Set as active for a connected llm provider and writes only activeProviders.llm', async () => {
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
    },
    {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      description: 'Codex',
      icon: null,
      connectionOptions: [
        {
          type: 'oauth',
          label: 'OpenAI Account',
          description: 'Sign in',
          buttonLabel: 'Continue in browser',
          flow: 'systemBrowser'
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
          config: { apiKey: 'sk-test' }
        }
      },
      activeProviders: {}
    }
  })

  await renderProviders()

  fireEvent.click(screen.getByRole('button', { name: 'Set as active' }))

  await waitFor(() => {
    expect(providerStore.getState().replace).toHaveBeenCalledWith({
      providers: {
        openai: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'sk-test' }
        }
      },
      activeProviders: {
        llm: 'openai'
      }
    })
  })
})

test('disconnecting an active asr provider clears only activeProviders.asr', async () => {
  asrProviders = [
    {
      id: 'deepgram',
      displayName: 'Deepgram',
      description: 'Speech to text',
      icon: null,
      kind: 'cloud',
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
        deepgram: {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'dg-test' }
        }
      },
      activeProviders: {
        llm: 'openai',
        asr: 'deepgram'
      }
    }
  })

  await renderProviders()

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

  await waitFor(() => {
    expect(providerStore.getState().replace).toHaveBeenCalledWith({
      providers: {},
      activeProviders: {
        llm: 'openai'
      }
    })
  })
})
```

Also update the existing connect-related assertions so they expect writes against `providers` rather than the old flat top-level map.

- [ ] **Step 2: Run the providers page test file and verify it fails**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: FAIL because the components still read the old flat `ProviderSettings` shape and no activation button exists.

- [ ] **Step 3: Implement renderer state separation and activation controls**

Update `apps/desktop/src/renderer/src/pages/main/providers.tsx` to work with `settings.providers` and `settings.activeProviders` explicitly:

```ts
async function handleSave(
  providerId: string,
  connectionType: Extract<ProviderConnectionType, 'apiKey' | 'local'>,
  config?: Record<string, string>
) {
  await replaceSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [providerId]: {
        enabled: true,
        connectionType,
        config
      }
    }
  })
}

async function handleSetActive(sectionKey: 'llm' | 'asr', providerId: string) {
  if (!settings.providers[providerId]?.enabled) {
    return
  }

  await replaceSettings({
    ...settings,
    activeProviders: {
      ...settings.activeProviders,
      [sectionKey]: providerId
    }
  })
}

async function handleDisconnect(
  sectionKey: 'llm' | 'asr',
  providerId: string,
  connectionType: ProviderConnectionType
) {
  // remove provider record and clear matching active slot when needed
}
```

Update `apps/desktop/src/renderer/src/components/providers/provider-section.tsx` to pass the capability context down to each row:

```ts
export function ProviderSection({
  sectionKey,
  title,
  providers,
  settings,
  activeProviderId,
  onConnect,
  onDisconnect,
  onSetActive
}: {
  sectionKey: 'llm' | 'asr'
  title: string
  providers: ProviderViewModel[]
  settings: Record<string, ProviderConnectionRecord | undefined>
  activeProviderId?: string
  onConnect: (provider: ProviderViewModel) => void
  onDisconnect: (
    sectionKey: 'llm' | 'asr',
    providerId: string,
    connectionType: ProviderConnectionRecord['connectionType']
  ) => void
  onSetActive: (sectionKey: 'llm' | 'asr', providerId: string) => void
}) { /* pass activeProviderId and sectionKey to ProviderRow */ }
```

Update `apps/desktop/src/renderer/src/components/providers/provider-types.ts` to derive activation state separately from connection state:

```ts
export interface ResolvedProviderConnectionState {
  buttonLabel: 'Connect' | 'Disconnect'
  description: string
  disconnectConnectionType?: ProviderConnectionRecord['connectionType']
  helperText?: string
  isActive: boolean
  isConnected: boolean
  isConnectedViaOAuth: boolean
  statusBadge?: string
}

export function resolveProviderConnectionState(
  provider: ProviderViewModel,
  setting: ProviderConnectionRecord | undefined,
  authStatus: ProviderAuthState | undefined,
  activeProviderId: string | undefined
): ResolvedProviderConnectionState {
  // preserve current connect/disconnect logic, then set isActive = isConnected && activeProviderId === provider.id
}
```

Update `apps/desktop/src/renderer/src/components/providers/provider-row.tsx` to render two independent actions when connected:

```tsx
{state.isConnected ? (
  <div className="flex shrink-0 items-center gap-2">
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onDisconnect(sectionKey, provider.id, state.disconnectConnectionType!)}
    >
      Disconnect
    </Button>
    {state.isActive ? (
      <Button variant="secondary" size="sm" disabled>
        Active
      </Button>
    ) : (
      <Button variant="secondary" size="sm" onClick={() => onSetActive(sectionKey, provider.id)}>
        Set as active
      </Button>
    )}
  </div>
) : (
  actionButton
)}
```

Update the page copy in `apps/desktop/src/renderer/src/pages/main/providers.tsx`:

```tsx
<TypographyMuted className="not-first:mt-2">
  Connect multiple providers, then choose which one each pipeline uses.
</TypographyMuted>
```

Use `replaceSettings` for nested writes in this task. Do not rely on shallow top-level merges for nested `providers` or `activeProviders`.

- [ ] **Step 4: Re-run the providers page test file and verify it passes**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
```

Expected: PASS with the new activation tests green and the existing connect/OAuth tests updated for the new settings shape.

- [ ] **Step 5: Commit the renderer activation flow**

Run:

```bash
git add apps/desktop/src/renderer/src/pages/main/providers.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-section.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-row.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-types.ts \
  apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat(providers): add active provider selection controls"
```

### Task 3: Update Main-Process Persistence, OAuth Writes, and Runtime Selection Helpers

**Files:**
- Modify: `apps/desktop/src/main/store/schema.ts`
- Modify: `apps/desktop/src/main/store/instance.ts`
- Modify: `apps/desktop/src/main/auth/oauth-service.ts`
- Modify: `apps/desktop/src/main/providers/runtime.ts`
- Modify: `apps/desktop/src/main/__tests__/oauth-service.test.ts`
- Modify: `apps/desktop/src/main/__tests__/provider-runtime.test.ts`

- [ ] **Step 1: Write the failing main-process tests**

Update `apps/desktop/src/main/__tests__/oauth-service.test.ts` so it expects structured settings writes and active-selection cleanup:

```ts
expect(store.get('providers')).toEqual({
  providers: {
    'openai-codex': {
      enabled: true,
      connectionType: 'oauth',
      account: session.account,
      auth: {
        status: 'connected',
        lastConnectedAt: expect.any(String)
      }
    }
  },
  activeProviders: {}
})
```

Add a disconnect test that seeds an active selection and expects it to be cleared:

```ts
store.set('providers', {
  providers: {
    'openai-codex': {
      enabled: true,
      connectionType: 'oauth',
      account: { email: 'dev@example.com', accountId: 'acct_123' },
      auth: {
        status: 'connected',
        lastConnectedAt: '2026-03-28T12:00:00.000Z'
      }
    }
  },
  activeProviders: {
    llm: 'openai-codex'
  }
})

expect(store.get('providers')).toEqual({
  providers: {},
  activeProviders: {}
})
```

Update `apps/desktop/src/main/__tests__/provider-runtime.test.ts` to use the structured store shape and add explicit active-provider tests:

```ts
test('returns the active llm provider id from structured provider settings', async () => {
  const store = new MemoryStore()
  store.set('providers', {
    providers: {
      'openai-codex': {
        enabled: true,
        connectionType: 'oauth',
        account: { accountId: 'acct_codex' },
        auth: {
          status: 'connected',
          lastConnectedAt: '2026-03-30T00:00:00.000Z'
        }
      }
    },
    activeProviders: {
      llm: 'openai-codex'
    }
  })

  expect(getActiveLLMProviderId(store)).toBe('openai-codex')
})

test('throws a configuration error when no active llm provider is selected', async () => {
  const store = new MemoryStore()

  await expect(resolveActiveLLMProvider({ llmRegistry, oauthService, store })).rejects.toThrow(
    '[llm] No active provider is selected'
  )
})
```

- [ ] **Step 2: Run the main-process test files and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/oauth-service.test.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: FAIL because main store schema, OAuth persistence, and runtime helpers still assume the old flat `providers` map.

- [ ] **Step 3: Implement structured main-store helpers and runtime selection**

Update `apps/desktop/src/main/store/schema.ts` and `apps/desktop/src/main/store/instance.ts` to persist structured provider settings by default:

```ts
import type { ProviderSettings } from '../../shared/provider-auth'

export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  providers: ProviderSettings
  settings: Record<string, unknown>
  [key: string]: unknown
}
```

```ts
defaults: {
  aboutMe: {},
  dictionary: {},
  providers: {
    providers: {},
    activeProviders: {}
  },
  settings: {}
}
```

Update `apps/desktop/src/main/auth/oauth-service.ts` so it always reads, mutates, and writes structured settings:

```ts
private getProviderSettings(): ProviderSettings {
  return normalizeProviderSettings(this.options.store.get('providers'))
}

private setProviderSettings(settings: ProviderSettings): void {
  this.options.store.set('providers', settings)
}

async start(providerId: string): Promise<ConnectedProviderAuthState> {
  const settings = this.getProviderSettings()
  const existing = settings.providers[providerId]

  this.setProviderSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [providerId]: createConnectedProviderMetadata(session.account, lastConnectedAt, existing)
    }
  })
}

async disconnect(providerId: string): Promise<ProviderAuthState> {
  const settings = this.getProviderSettings()
  const nextProviders = { ...settings.providers }
  delete nextProviders[providerId]

  this.setProviderSettings({
    providers: nextProviders,
    activeProviders: clearActiveProviderSelections(settings.activeProviders, providerId)
  })
}
```

Update `apps/desktop/src/main/providers/runtime.ts` so it reads structured settings and exposes explicit active-selection helpers:

```ts
function getProviderSettings(store: StoreLike): ProviderSettings {
  return normalizeProviderSettings(store.get('providers'))
}

function getProviderRecords(store: StoreLike): Record<string, ProviderConnectionRecord> {
  return getProviderSettings(store).providers
}

export function getActiveLLMProviderId(store: StoreLike): string | undefined {
  return getProviderSettings(store).activeProviders.llm
}

export function getActiveASRProviderId(store: StoreLike): string | undefined {
  return getProviderSettings(store).activeProviders.asr
}

export async function resolveActiveLLMProvider(deps: ProviderRuntimeDeps): Promise<LLMProvider> {
  const providerId = getActiveLLMProviderId(deps.store)
  if (!providerId) {
    throw new ConfigurationError('llm', 'No active provider is selected')
  }

  return resolveLLMProvider(providerId, deps)
}
```

Keep `resolveLLMProvider(providerId, deps)` intact for existing direct callers. This task adds the active-provider path without forcing an unrelated API migration in the same change.

- [ ] **Step 4: Re-run the main-process test files and verify they pass**

Run:

```bash
pnpm vitest run apps/desktop/src/main/__tests__/oauth-service.test.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: PASS with structured settings writes, active-selection cleanup, and active-provider resolution covered.

- [ ] **Step 5: Commit the main-process activation support**

Run:

```bash
git add apps/desktop/src/main/store/schema.ts \
  apps/desktop/src/main/store/instance.ts \
  apps/desktop/src/main/auth/oauth-service.ts \
  apps/desktop/src/main/providers/runtime.ts \
  apps/desktop/src/main/__tests__/oauth-service.test.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts
git commit -m "feat(providers): persist active provider selections"
```

### Task 4: Run Focused Regression Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the renderer and main-process provider test suites together**

Run:

```bash
pnpm vitest run \
  apps/desktop/src/renderer/src/stores/__tests__/provider-store.test.ts \
  apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx \
  apps/desktop/src/main/__tests__/oauth-service.test.ts \
  apps/desktop/src/main/__tests__/provider-runtime.test.ts
```

Expected: PASS across all four files.

- [ ] **Step 2: Run one broader desktop test sweep around touched areas**

Run:

```bash
pnpm vitest run apps/desktop/src/preload/__tests__/index.test.ts \
  apps/desktop/src/main/__tests__/provider-auth-router.test.ts \
  apps/desktop/src/main/__tests__/providers-router.test.ts
```

Expected: PASS, proving the provider auth bridge and router surfaces still work after the store-shape migration.

- [ ] **Step 3: Review the final diff for accidental scope creep**

Run:

```bash
git diff --stat HEAD~3..HEAD
git diff -- apps/desktop/src/shared/provider-auth.ts \
  apps/desktop/src/renderer/src/stores/create-persisted-store.ts \
  apps/desktop/src/renderer/src/stores/provider-store.ts \
  apps/desktop/src/renderer/src/pages/main/providers.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-section.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-row.tsx \
  apps/desktop/src/renderer/src/components/providers/provider-types.ts \
  apps/desktop/src/main/auth/oauth-service.ts \
  apps/desktop/src/main/providers/runtime.ts \
  apps/desktop/src/main/store/schema.ts \
  apps/desktop/src/main/store/instance.ts
```

Expected: only provider settings, provider page UI, OAuth persistence, runtime helper, and related tests are changed.

- [ ] **Step 4: Create the final integration commit if verification required touch-ups**

If verification exposed any last-minute fixups, commit them with:

```bash
git add -A
git commit -m "test(providers): verify provider activation flows"
```

If no fixups were needed after the previous three commits, skip this step.
