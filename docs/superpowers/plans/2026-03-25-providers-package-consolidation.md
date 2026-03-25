# Providers Package Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `packages/core` into `packages/providers`, adopt the approved `shared` / `llm` / `asr` layout, and update all repository consumers to the new `@openbroca/providers` import surface.

**Architecture:** Keep one provider platform package and organize it by capability domain. Shared primitives stay at the package root export, LLM and ASR contracts get their own subpath exports, and concrete providers move under domain-specific `providers/` directories. This is a structural refactor only: preserve existing runtime behavior and provider descriptor patterns.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, Vitest, Electron, Vite

---

## File Map

### Create

- `packages/providers/src/shared/errors.ts` — moved provider error classes
- `packages/providers/src/shared/types.ts` — moved `ConfigSchema`, `Disposable`, `HealthCheckable`
- `packages/providers/src/shared/assets.d.ts` — raw SVG module typing
- `packages/providers/src/shared/__tests__/errors.test.ts` — moved shared error tests
- `packages/providers/src/shared/icons/index.ts` — aggregated `providerIcons` export
- `packages/providers/src/llm/index.ts` — public LLM export surface
- `packages/providers/src/llm/contracts.ts` — LLM contracts and middleware helpers
- `packages/providers/src/llm/registry.ts` — `LLMProviderRegistry`
- `packages/providers/src/llm/__tests__/registry.test.ts` — moved registry tests
- `packages/providers/src/llm/__tests__/middleware.test.ts` — moved middleware tests
- `packages/providers/src/llm/providers/openai/index.ts` — OpenAI descriptor entry
- `packages/providers/src/llm/providers/openai/provider.ts` — OpenAI provider implementation
- `packages/providers/src/asr/index.ts` — public ASR export surface
- `packages/providers/src/asr/contracts.ts` — ASR contracts
- `packages/providers/src/asr/registry.ts` — `ASRProviderRegistry`
- `packages/providers/src/asr/__tests__/registry.test.ts` — moved ASR registry tests
- `packages/providers/src/asr/providers/deepgram/index.ts` — Deepgram descriptor entry
- `packages/providers/src/asr/providers/deepgram/provider.ts` — Deepgram provider implementation
- `packages/providers/src/asr/providers/sherpa-onnx/index.ts` — Sherpa descriptor entry
- `packages/providers/src/asr/providers/sherpa-onnx/provider.ts` — Sherpa provider implementation
- `packages/providers/src/asr/providers/sherpa-onnx/sherpa-onnx-node.d.ts` — local sherpa type shim

### Modify

- `packages/providers/package.json`
- `packages/providers/tsconfig.json`
- `packages/providers/src/index.ts`
- `apps/desktop/package.json`
- `apps/desktop/electron.vite.config.ts`
- `apps/desktop/src/main/providers/index.ts`
- `apps/desktop/src/main/trpc/context.ts`
- `vitest.workspace.ts`
- `CLAUDE.md`
- `pnpm-lock.yaml`

### Delete

- `packages/core/`
- `packages/providers/src/assets.d.ts`
- `packages/providers/src/icons/`
- `packages/providers/src/openai/`
- `packages/providers/src/deepgram/`
- `packages/providers/src/sherpa-onnx/`

### Keep Behavior Stable

- Provider IDs remain unchanged: `openai`, `deepgram`, `sherpa-onnx`
- Descriptor schemas remain unchanged
- LLM registry middleware behavior remains unchanged
- ASR registry behavior and Sherpa model-management behavior remain unchanged
- Only imports, package boundaries, and directory layout change

## Task 1: Rebuild the `@openbroca/providers` package shell and shared foundation

**Files:**
- Create: `packages/providers/src/shared/errors.ts`
- Create: `packages/providers/src/shared/types.ts`
- Create: `packages/providers/src/shared/assets.d.ts`
- Create: `packages/providers/src/shared/__tests__/errors.test.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/package.json`
- Modify: `packages/providers/tsconfig.json`

- [ ] **Step 1: Move the shared error test first**

Create `packages/providers/src/shared/__tests__/errors.test.ts` by copying the old assertions from `packages/core/src/__tests__/errors.test.ts` and updating its imports to `../errors.ts`.

- [ ] **Step 2: Run the moved shared test and verify it fails before implementation**

Run: `pnpm --filter @openbroca/providers test -- src/shared/__tests__/errors.test.ts`
Expected: FAIL with module resolution errors for `../errors.ts` until the shared files exist.

- [ ] **Step 3: Create the new shared foundation files**

Add `packages/providers/src/shared/errors.ts`, `packages/providers/src/shared/types.ts`, and `packages/providers/src/shared/assets.d.ts` by moving the current `packages/core/src/errors.ts`, `packages/core/src/types.ts`, and `packages/providers/src/assets.d.ts` contents without behavior changes.

Target top-level export in `packages/providers/src/index.ts`:

```ts
export { ConfigurationError, ProviderError, TranscriptionError } from './shared/errors.ts'
export { type ConfigSchema, type Disposable, type HealthCheckable } from './shared/types.ts'
```

- [ ] **Step 4: Rewrite the `@openbroca/providers` export map**

Update `packages/providers/package.json` so it no longer depends on `@openbroca/core` and exports the new public surface:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./llm": "./src/llm/index.ts",
    "./asr": "./src/asr/index.ts",
    "./llm/openai": "./src/llm/providers/openai/index.ts",
    "./asr/deepgram": "./src/asr/providers/deepgram/index.ts",
    "./asr/sherpa-onnx": "./src/asr/providers/sherpa-onnx/index.ts",
    "./icons": "./src/shared/icons/index.ts"
  }
}
```

- [ ] **Step 5: Update the package TypeScript config for the new icon path**

Change `packages/providers/tsconfig.json` so the icon exclusion points at `src/shared/icons/**/*` instead of the old `src/icons/**/*`.

- [ ] **Step 6: Re-run the shared test and make it pass**

Run: `pnpm --filter @openbroca/providers test -- src/shared/__tests__/errors.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the shared foundation move**

```bash
git add packages/providers/package.json packages/providers/tsconfig.json packages/providers/src/index.ts packages/providers/src/shared
git commit -m "refactor: move shared provider foundation into providers package"
```

## Task 2: Move the LLM contracts, registry, and tests into `src/llm`

**Files:**
- Create: `packages/providers/src/llm/contracts.ts`
- Create: `packages/providers/src/llm/registry.ts`
- Create: `packages/providers/src/llm/index.ts`
- Create: `packages/providers/src/llm/__tests__/registry.test.ts`
- Create: `packages/providers/src/llm/__tests__/middleware.test.ts`

- [ ] **Step 1: Move the LLM tests before moving the implementation**

Copy these tests from `packages/core` into the new locations and update imports to point at `../registry.ts` and `../contracts.ts`:

- `packages/core/src/llm/__tests__/registry.test.ts` -> `packages/providers/src/llm/__tests__/registry.test.ts`
- `packages/core/src/llm/__tests__/middleware.test.ts` -> `packages/providers/src/llm/__tests__/middleware.test.ts`

- [ ] **Step 2: Run the moved LLM tests and verify they fail**

Run: `pnpm --filter @openbroca/providers test -- src/llm/__tests__/registry.test.ts src/llm/__tests__/middleware.test.ts`
Expected: FAIL with missing `registry.ts` / `contracts.ts` modules.

- [ ] **Step 3: Create `contracts.ts` and preserve the existing LLM contract surface**

Move `packages/core/src/llm/types.ts` to `packages/providers/src/llm/contracts.ts` and keep all exported types and `composeMiddleware()` intact. Update its shared imports to relative paths:

```ts
import type { ConfigSchema, Disposable, HealthCheckable } from '../shared/types.ts'
```

- [ ] **Step 4: Create `registry.ts` and preserve existing registry behavior**

Move `packages/core/src/llm/registry.ts` to `packages/providers/src/llm/registry.ts` and update imports to:

```ts
import { ProviderError } from '../shared/errors.ts'
import {
  composeMiddleware,
  type LLMCapabilities,
  type LLMMiddleware,
  type LLMProvider,
  type LLMProviderDescriptor,
} from './contracts.ts'
```

- [ ] **Step 5: Add the new `src/llm/index.ts` export surface**

Use:

```ts
export { LLMProviderRegistry, type LLMRegistryHooks } from './registry.ts'
export {
  composeMiddleware,
  type ChatMessage,
  type CompletionChunk,
  type CompletionFn,
  type CompletionRequest,
  type CompletionResult,
  type LLMCapabilities,
  type LLMMiddleware,
  type LLMModel,
  type LLMProvider,
  type LLMProviderDescriptor,
  type TokenUsage,
} from './contracts.ts'
```

- [ ] **Step 6: Run the moved LLM tests and make them pass**

Run: `pnpm --filter @openbroca/providers test -- src/llm/__tests__/registry.test.ts src/llm/__tests__/middleware.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the LLM domain move**

```bash
git add packages/providers/src/llm
git commit -m "refactor: move llm contracts and registry into providers"
```

## Task 3: Move the ASR contracts, registry, and tests into `src/asr`

**Files:**
- Create: `packages/providers/src/asr/contracts.ts`
- Create: `packages/providers/src/asr/registry.ts`
- Create: `packages/providers/src/asr/index.ts`
- Create: `packages/providers/src/asr/__tests__/registry.test.ts`

- [ ] **Step 1: Move the ASR registry test first**

Copy `packages/core/src/asr/__tests__/registry.test.ts` to `packages/providers/src/asr/__tests__/registry.test.ts` and update imports to `../registry.ts` and `../contracts.ts`.

- [ ] **Step 2: Run the moved ASR test and verify it fails**

Run: `pnpm --filter @openbroca/providers test -- src/asr/__tests__/registry.test.ts`
Expected: FAIL with missing `registry.ts` / `contracts.ts` modules.

- [ ] **Step 3: Create `contracts.ts` and preserve the existing ASR contract surface**

Move `packages/core/src/asr/types.ts` to `packages/providers/src/asr/contracts.ts` and update its shared import to:

```ts
import type { ConfigSchema, Disposable } from '../shared/types.ts'
```

- [ ] **Step 4: Create `registry.ts` and preserve existing registry behavior**

Move `packages/core/src/asr/registry.ts` to `packages/providers/src/asr/registry.ts` and update imports to:

```ts
import { ProviderError } from '../shared/errors.ts'
import type {
  ASRProviderDescriptor,
  CloudASRProvider,
  LocalASRProvider,
} from './contracts.ts'
```

- [ ] **Step 5: Add the new `src/asr/index.ts` export surface**

Use:

```ts
export { ASRProviderRegistry, type AnyASRProvider, type ASRRegistryHooks } from './registry.ts'
export {
  type ASRProvider,
  type ASRProviderDescriptor,
  type CloudASRProvider,
  type DownloadProgress,
  type LocalASRProvider,
  type LocalModelInfo,
  type TranscriptionOptions,
  type TranscriptionSegment,
} from './contracts.ts'
```

- [ ] **Step 6: Run the moved ASR test and make it pass**

Run: `pnpm --filter @openbroca/providers test -- src/asr/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the ASR domain move**

```bash
git add packages/providers/src/asr
git commit -m "refactor: move asr contracts and registry into providers"
```

## Task 4: Move the OpenAI provider into the LLM domain

**Files:**
- Create: `packages/providers/src/llm/providers/openai/index.ts`
- Create: `packages/providers/src/llm/providers/openai/provider.ts`
- Create: `packages/providers/src/llm/providers/openai/icon.svg`
- Create: `packages/providers/src/llm/providers/openai/__tests__/descriptor.test.ts`
- Delete: `packages/providers/src/openai/`

- [ ] **Step 1: Move the OpenAI descriptor test first**

Copy `packages/providers/src/openai/__tests__/descriptor.test.ts` to `packages/providers/src/llm/providers/openai/__tests__/descriptor.test.ts` and update it to import from `../index.ts`.

- [ ] **Step 2: Run the moved OpenAI test and verify it fails**

Run: `pnpm --filter @openbroca/providers test -- src/llm/providers/openai/__tests__/descriptor.test.ts`
Expected: FAIL because the new `index.ts` does not exist yet.

- [ ] **Step 3: Move the OpenAI implementation to the new directory and fix imports**

Move `packages/providers/src/openai/provider.ts` to `packages/providers/src/llm/providers/openai/provider.ts` and update imports to package-internal relative paths:

```ts
import { ConfigurationError } from '../../../shared/errors.ts'
import type {
  CompletionChunk,
  CompletionRequest,
  LLMModel,
  LLMProvider,
} from '../../contracts.ts'
```

- [ ] **Step 4: Move the OpenAI descriptor entry and preserve descriptor behavior**

Move `packages/providers/src/openai/index.ts` to `packages/providers/src/llm/providers/openai/index.ts` and update imports to:

```ts
/// <reference path="../../../shared/assets.d.ts" />
import { z } from 'zod'
import type { LLMProviderDescriptor } from '../../contracts.ts'
import { OpenAILLMProvider, type OpenAIConfig } from './provider.ts'
import icon from './icon.svg?raw'
```

- [ ] **Step 5: Run the moved OpenAI test and make it pass**

Run: `pnpm --filter @openbroca/providers test -- src/llm/providers/openai/__tests__/descriptor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the OpenAI move**

```bash
git add packages/providers/src/llm/providers/openai
git add -u packages/providers/src/openai
git commit -m "refactor: move openai provider under llm domain"
```

## Task 5: Move the ASR providers and icon aggregation into the new layout

**Files:**
- Create: `packages/providers/src/asr/providers/deepgram/index.ts`
- Create: `packages/providers/src/asr/providers/deepgram/provider.ts`
- Create: `packages/providers/src/asr/providers/deepgram/icon.svg`
- Create: `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`
- Create: `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
- Create: `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`
- Create: `packages/providers/src/asr/providers/sherpa-onnx/icon.svg`
- Create: `packages/providers/src/asr/providers/sherpa-onnx/sherpa-onnx-node.d.ts`
- Create: `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
- Create: `packages/providers/src/shared/icons/index.ts`
- Delete: `packages/providers/src/deepgram/`
- Delete: `packages/providers/src/sherpa-onnx/`
- Delete: `packages/providers/src/icons/`

- [ ] **Step 1: Move the Deepgram and Sherpa descriptor tests first**

Copy:

- `packages/providers/src/deepgram/__tests__/descriptor.test.ts` -> `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`
- `packages/providers/src/sherpa-onnx/__tests__/descriptor.test.ts` -> `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`

Update both files to import from `../index.ts`.

- [ ] **Step 2: Run the moved ASR provider tests and verify they fail**

Run: `pnpm --filter @openbroca/providers test -- src/asr/providers/deepgram/__tests__/descriptor.test.ts src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
Expected: FAIL because the new descriptor entry files do not exist yet.

- [ ] **Step 3: Move the Deepgram provider files and fix imports**

Move `packages/providers/src/deepgram/provider.ts` and `index.ts` into `packages/providers/src/asr/providers/deepgram/` and update imports to:

```ts
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import type {
  ASRProvider,
  TranscriptionOptions,
  TranscriptionSegment,
} from '../../contracts.ts'
```

Descriptor entry should use:

```ts
/// <reference path="../../../shared/assets.d.ts" />
import type { ASRProviderDescriptor } from '../../contracts.ts'
```

- [ ] **Step 4: Move the Sherpa provider files and fix imports**

Move `provider.ts`, `index.ts`, `icon.svg`, and `sherpa-onnx-node.d.ts` into `packages/providers/src/asr/providers/sherpa-onnx/` and update imports to:

```ts
import { ConfigurationError, TranscriptionError } from '../../../shared/errors.ts'
import type {
  DownloadProgress,
  LocalASRProvider,
  LocalModelInfo,
  TranscriptionOptions,
  TranscriptionSegment,
} from '../../contracts.ts'
```

Descriptor entry should use:

```ts
/// <reference path="../../../shared/assets.d.ts" />
import type { ASRProviderDescriptor } from '../../contracts.ts'
```

- [ ] **Step 5: Move the icon aggregation to `src/shared/icons`**

Move all standalone icon SVGs from `packages/providers/src/icons/` into `packages/providers/src/shared/icons/`, then rewrite the aggregation module to import provider-owned icons from their new domain paths:

```ts
/// <reference path="../assets.d.ts" />
import openai from '../../llm/providers/openai/icon.svg?raw'
import deepgram from '../../asr/providers/deepgram/icon.svg?raw'
import sherpaOnnx from '../../asr/providers/sherpa-onnx/icon.svg?raw'
import anthropic from './anthropic.svg?raw'
```

- [ ] **Step 6: Run the moved ASR provider tests and make them pass**

Run: `pnpm --filter @openbroca/providers test -- src/asr/providers/deepgram/__tests__/descriptor.test.ts src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the ASR provider and icon move**

```bash
git add packages/providers/src/asr/providers packages/providers/src/shared/icons
git add -u packages/providers/src/deepgram packages/providers/src/sherpa-onnx packages/providers/src/icons
git commit -m "refactor: move asr providers and icons into domain layout"
```

## Task 6: Update consumers, remove `packages/core`, and verify the workspace

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/electron.vite.config.ts`
- Modify: `apps/desktop/src/main/providers/index.ts`
- Modify: `apps/desktop/src/main/trpc/context.ts`
- Modify: `vitest.workspace.ts`
- Modify: `CLAUDE.md`
- Modify: `pnpm-lock.yaml`
- Delete: `packages/core/`

- [ ] **Step 1: Update desktop imports and dependencies**

Apply the new import surface everywhere:

```ts
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { sherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'
```

Also remove `@openbroca/core` from `apps/desktop/package.json`.

- [ ] **Step 2: Update bundler and workspace test configuration**

Change `apps/desktop/electron.vite.config.ts` so `externalizeDeps.exclude` no longer lists `@openbroca/core`.

Change `vitest.workspace.ts` to:

```ts
export default ['packages/providers']
```

- [ ] **Step 3: Rewrite repository documentation for the new package structure**

Update `CLAUDE.md` so it documents a single provider package with the new imports:

- `@openbroca/providers`
- `@openbroca/providers/llm`
- `@openbroca/providers/asr`
- `@openbroca/providers/llm/openai`
- `@openbroca/providers/asr/deepgram`
- `@openbroca/providers/asr/sherpa-onnx`

- [ ] **Step 4: Delete the old `packages/core` tree and legacy top-level provider directories**

Remove:

- `packages/core/`
- `packages/providers/src/openai/`
- `packages/providers/src/deepgram/`
- `packages/providers/src/sherpa-onnx/`
- `packages/providers/src/icons/`
- `packages/providers/src/assets.d.ts`

- [ ] **Step 5: Search for stale imports and make the search pass cleanly**

Run: `rg -n "@openbroca/core|@openbroca/providers/(openai|deepgram|sherpa-onnx)|packages/core" apps packages CLAUDE.md vitest.workspace.ts pnpm-lock.yaml`
Expected: no matches in source, manifests, workspace config, or docs

- [ ] **Step 6: Refresh workspace links and lockfile**

Run: `pnpm install`
Expected: `pnpm-lock.yaml` drops `@openbroca/core` and workspace linking succeeds.

- [ ] **Step 7: Run package-level verification**

Run:

```bash
pnpm --filter @openbroca/providers typecheck
pnpm --filter @openbroca/providers test
```

Expected: both commands PASS

- [ ] **Step 8: Run consumer and workspace verification**

Run:

```bash
pnpm --filter desktop typecheck
pnpm test
```

Expected: both commands PASS

- [ ] **Step 9: Commit the consolidation**

```bash
git add apps/desktop pnpm-lock.yaml vitest.workspace.ts CLAUDE.md packages/providers
git add -u packages/core
git commit -m "refactor: consolidate core into providers package"
```

## Execution Notes

- Do not use `@openbroca/providers/...` imports from inside `packages/providers`; use only relative imports within the package.
- Do not change provider runtime behavior while moving files.
- Do not introduce compatibility re-exports for `@openbroca/core`.
- If a verification step fails, fix the issue in the same task before moving on.
