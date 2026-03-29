# OpenAI Codex OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate `OpenAI Codex` provider that authenticates through system-browser OAuth, stores tokens in system secure storage, and keeps only non-sensitive connection state in `electron-store`.

**Architecture:** The desktop main process owns the OAuth state machine, localhost callback server, token exchange, and secure credential storage. The providers page consumes new provider metadata plus auth-status APIs over tRPC, while the existing `OpenAI API` provider remains API-key based and isolated from Codex-specific transport logic.

**Tech Stack:** Electron main/preload IPC, tRPC, React, Zustand persisted store, `keytar`, Node HTTP server, Vitest

---

### Task 1: Add OAuth and secure-storage domain types

**Files:**
- Create: `packages/providers/src/shared/oauth.ts`
- Modify: `packages/providers/src/shared/connection.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/src/llm/contracts.ts`
- Modify: `packages/providers/src/llm/index.ts`
- Test: `packages/providers/src/llm/providers/openai/__tests__/descriptor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('declares a browser OAuth connection option for the Codex provider', () => {
  expect(openaiCodexDescriptor.connectionOptions).toEqual([
    expect.objectContaining({
      type: 'oauth',
      flow: 'systemBrowser',
      provider: 'openai-codex',
    }),
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @openbroca/providers exec vitest run src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
Expected: FAIL because `openaiCodexDescriptor` and OAuth metadata types do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ProviderOAuthConnectionOption {
  type: 'oauth'
  flow: 'systemBrowser'
  provider: string
  scopes?: string[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @openbroca/providers exec vitest run src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/shared/oauth.ts packages/providers/src/shared/connection.ts packages/providers/src/index.ts packages/providers/src/llm/contracts.ts packages/providers/src/llm/index.ts packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts
git commit -m "feat: add oauth provider metadata types"
```

### Task 2: Add the OpenAI Codex provider descriptor and transport surface

**Files:**
- Create: `packages/providers/src/llm/providers/openai-codex/index.ts`
- Create: `packages/providers/src/llm/providers/openai-codex/provider.ts`
- Create: `packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
- Modify: `packages/providers/package.json`
- Modify: `apps/desktop/src/main/providers/index.ts`
- Test: `packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('registers a distinct openai-codex provider with oauth metadata', () => {
  expect(openaiCodexDescriptor.id).toBe('openai-codex')
  expect(openaiCodexDescriptor.connectionOptions?.[0]).toEqual(
    expect.objectContaining({ type: 'oauth', flow: 'systemBrowser' }),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @openbroca/providers exec vitest run src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
Expected: FAIL because the provider package export and descriptor do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export const openaiCodexDescriptor = {
  id: 'openai-codex',
  displayName: 'OpenAI Codex',
  connectionOptions: [{ type: 'oauth', flow: 'systemBrowser', provider: 'openai-codex' }],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @openbroca/providers exec vitest run src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/llm/providers/openai-codex packages/providers/package.json apps/desktop/src/main/providers/index.ts
git commit -m "feat: add openai codex provider descriptor"
```

### Task 3: Add secure token storage and OAuth session management in Electron main

**Files:**
- Create: `apps/desktop/src/main/auth/secure-storage.ts`
- Create: `apps/desktop/src/main/auth/oauth-service.ts`
- Create: `apps/desktop/src/main/auth/openai-codex-oauth.ts`
- Create: `apps/desktop/src/main/__tests__/oauth-service.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/store/schema.ts`
- Test: `apps/desktop/src/main/__tests__/oauth-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('starts browser oauth, handles callback, and persists token to secure storage', async () => {
  const result = await oauthService.start('openai-codex')
  expect(result.status).toBe('connected')
  expect(secureStorage.setSecret).toHaveBeenCalledWith(
    'provider:openai-codex',
    expect.stringContaining('"refreshToken"'),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test src/main/__tests__/oauth-service.test.ts`
Expected: FAIL because the OAuth service and secure storage adapters do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
class OAuthService {
  async start(providerId: string) {
    const session = await openaiCodexOAuth.authorize()
    await secureStorage.setSecret(`provider:${providerId}`, JSON.stringify(session.tokens))
    return { status: 'connected', account: session.account }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop test src/main/__tests__/oauth-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/auth apps/desktop/src/main/__tests__/oauth-service.test.ts apps/desktop/package.json apps/desktop/src/main/index.ts apps/desktop/src/main/store/schema.ts
git commit -m "feat: add electron oauth service and secure storage"
```

### Task 4: Expose OAuth status and actions through preload and tRPC

**Files:**
- Modify: `apps/desktop/src/main/trpc/context.ts`
- Modify: `apps/desktop/src/main/trpc/router.ts`
- Create: `apps/desktop/src/main/trpc/routers/provider-auth.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/renderer/src/trpc/trpc.ts`
- Test: `apps/desktop/src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('exposes provider auth commands through preload', async () => {
  expect(window.api.providerAuth.connect('openai-codex')).resolves.toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test src/preload/__tests__/index.test.ts`
Expected: FAIL because the bridge does not expose provider auth APIs.

- [ ] **Step 3: Write minimal implementation**

```ts
providerAuth: {
  connect: (providerId) => ipcRenderer.invoke('provider-auth:connect', providerId),
  disconnect: (providerId) => ipcRenderer.invoke('provider-auth:disconnect', providerId),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop test src/preload/__tests__/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/trpc/context.ts apps/desktop/src/main/trpc/router.ts apps/desktop/src/main/trpc/routers/provider-auth.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.d.ts apps/desktop/src/preload/__tests__/index.test.ts
git commit -m "feat: expose provider auth bridge"
```

### Task 5: Split the providers page into components and wire the OAuth UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/providers/provider-types.ts`
- Create: `apps/desktop/src/renderer/src/components/providers/provider-connect-dialog.tsx`
- Create: `apps/desktop/src/renderer/src/components/providers/provider-row.tsx`
- Create: `apps/desktop/src/renderer/src/components/providers/provider-section.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/providers.tsx`
- Modify: `apps/desktop/src/renderer/src/stores/provider-store.ts`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test('starts browser oauth for openai codex and shows connected account summary', async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))
  await waitFor(() => expect(mockConnect).toHaveBeenCalledWith('openai-codex'))
  expect(screen.getByText(/Connected as/)).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test src/renderer/src/pages/main/__tests__/providers.test.tsx`
Expected: FAIL because the page still renders inline components and OAuth actions are placeholders.

- [ ] **Step 3: Write minimal implementation**

```tsx
if (selectedOption.type === 'oauth') {
  await providerAuth.connect(provider.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop test src/renderer/src/pages/main/__tests__/providers.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/providers apps/desktop/src/renderer/src/pages/main/providers.tsx apps/desktop/src/renderer/src/stores/provider-store.ts apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx
git commit -m "feat: wire oauth providers page flow"
```

### Task 6: Verify the full stack and regression coverage

**Files:**
- Test: `apps/desktop/src/main/__tests__/oauth-service.test.ts`
- Test: `apps/desktop/src/preload/__tests__/index.test.ts`
- Test: `apps/desktop/src/renderer/src/pages/main/__tests__/providers.test.tsx`
- Test: `packages/providers/src/llm/providers/openai-codex/__tests__/descriptor.test.ts`

- [ ] **Step 1: Run the focused provider-package tests**

Run: `pnpm --filter @openbroca/providers exec vitest run src/llm/providers/openai/__tests__/descriptor.test.ts src/llm/providers/openai-codex/__tests__/descriptor.test.ts`
Expected: PASS

- [ ] **Step 2: Run focused desktop tests**

Run: `pnpm --filter desktop test src/main/__tests__/oauth-service.test.ts src/preload/__tests__/index.test.ts src/renderer/src/pages/main/__tests__/providers.test.tsx`
Expected: PASS

- [ ] **Step 3: Run workspace typecheck**

Run: `pnpm --filter @openbroca/providers typecheck && pnpm --filter desktop typecheck`
Expected: PASS

- [ ] **Step 4: Inspect resulting store contract**

Run: `git diff -- apps/desktop/src/renderer/src/stores/provider-store.ts apps/desktop/src/main/store/schema.ts`
Expected: Only non-sensitive provider metadata remains in persisted store.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add openai codex oauth provider"
```
