# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Structure

This is a **Turborepo monorepo** managed with pnpm workspaces.

```
apps/
  desktop/          ← Electron + React + TypeScript app
packages/
  core/             ← Provider interfaces & registries (@openbroca/core)
  providers/        ← Provider implementations (@openbroca/providers)
  typescript-config ← Shared TypeScript configs (@openbroca/typescript-config)
  eslint-config     ← Shared ESLint config (@openbroca/eslint-config)
  tailwind-config   ← Shared Tailwind base CSS (@openbroca/tailwind-config)
  ui/               ← Shared React component library (@openbroca/ui)
```

## Commands

### From repo root (via Turborepo)

```bash
pnpm dev              # Start all dev servers
pnpm build            # Build all apps
pnpm lint             # Lint all apps
pnpm format           # Format all apps
pnpm typecheck        # Typecheck all apps
```

### Targeting the desktop app specifically

```bash
pnpm --filter desktop dev              # Start dev server (Electron + Vite HMR)
pnpm --filter desktop build            # Typecheck + build all processes
pnpm --filter desktop build:mac        # Build macOS distributable
pnpm --filter desktop lint             # ESLint
pnpm --filter desktop format           # Prettier
pnpm --filter desktop typecheck        # Check both node and web TypeScript configs
pnpm --filter desktop typecheck:node   # Main/preload process types only
pnpm --filter desktop typecheck:web    # Renderer process types only
```

### From inside `apps/desktop/`

All the same scripts work directly with `pnpm dev`, `pnpm build`, etc.

**Adding shadcn components**: run `pnpm dlx shadcn add <component>` from inside `apps/desktop/` — the `components.json` aliases will place them correctly under `@renderer/components/ui/`.

```bash
pnpm --filter @openbroca/ui typecheck        # Typecheck the shared UI package
pnpm --filter @openbroca/core typecheck      # Typecheck the core interfaces package
pnpm --filter @openbroca/providers typecheck # Typecheck the provider implementations
```

```bash
pnpm test                                    # Run all tests (via Turborepo)
pnpm --filter @openbroca/core test           # Core tests only
pnpm --filter @openbroca/providers test      # Provider tests only
```

Vitest workspace config is at `vitest.workspace.ts` (root). Each testable package has its own `vitest.config.ts`. Test files live alongside source in `src/**/__tests__/*.test.ts`.

## Architecture

The desktop app is an **Electron + React + TypeScript** app built with [electron-vite](https://electron-vite.org/). The three Electron processes map directly to `apps/desktop/src/` subdirectories:

| Directory | Process | Role |
|---|---|---|
| `apps/desktop/src/main/` | Main | Electron entry, window creation, IPC handlers |
| `apps/desktop/src/preload/` | Preload | Exposes `window.electron` and `window.api` to renderer via `contextBridge` |
| `apps/desktop/src/renderer/` | Renderer | React SPA |

### Renderer (`apps/desktop/src/renderer/src/`)

Path alias `@renderer` resolves to `apps/desktop/src/renderer/src/`.

**Routing** — `react-router` v7 with `createHashRouter` (hash router required for Electron file protocol). Routes are defined in `router/index.tsx`. The root layout (`pages/root.tsx`) wraps all pages in a `SidebarProvider` + `AppSidebar` shell.

**Current pages**: Dashboard (index), Providers, Brocas, Dictionary, Skills, AboutMe.

**UI layer** — shadcn/ui components (style: `radix-maia`, base color: `mauve`) live in `components/ui/`. Icons use `@hugeicons/react`. Tailwind CSS v4 is configured entirely via `src/renderer/src/styles/globals.css` — there is no `tailwind.config.js`. CSS variables drive theming (light/dark via `.dark` class, managed by `ThemeProvider`).

### TypeScript config layering

Shared TS configs live in `packages/typescript-config` (`@openbroca/typescript-config`):

| Export | Purpose | Consumers |
|---|---|---|
| `base.json` | Strict baseline (no runtime assumptions) | extended by react/node configs |
| `react.json` | `base` + DOM libs + `react-jsx` | `packages/ui`, `apps/desktop` renderer |
| `node.json` | `base` + node types | future Node-only packages |

`apps/desktop/tsconfig.web.json` extends `@openbroca/typescript-config/react`. `tsconfig.node.json` keeps `@electron-toolkit/tsconfig` (Electron-specific).

### IPC pattern

Custom renderer→main APIs should be added to the `api` object in `apps/desktop/src/preload/index.ts` (exposed via `contextBridge`) and typed in `apps/desktop/src/preload/index.d.ts`. Main-side handlers go in `apps/desktop/src/main/index.ts` using `ipcMain`.

### Provider architecture (`packages/core` + `packages/providers`)

All packages export **raw TypeScript source** — no build step, consumed directly by Vite.

**`@openbroca/core`** defines the interfaces. Three subpath exports:
- `@openbroca/core` — `ProviderError`, `ConfigurationError`, `ConfigSchema<T>`, `Disposable`, `HealthCheckable`
- `@openbroca/core/llm` — `LLMProvider`, `LLMProviderDescriptor<TConfig>`, `LLMProviderRegistry`, `LLMMiddleware`, `CompletionFn`, `composeMiddleware`
- `@openbroca/core/asr` — `ASRProvider`, `CloudASRProvider`, `LocalASRProvider`, `ASRProviderDescriptor`, `ASRProviderRegistry`

**`@openbroca/providers`** implements three providers via subpath exports: `./openai` (LLM), `./deepgram` (cloud ASR), `./sherpa-onnx` (local ASR). Each export has a `*Descriptor` object that is the sole registration artifact.

**Adding a new provider** — implement the relevant interface from `@openbroca/core/{llm,asr}`, export a descriptor with a Zod (or any `.parse()`-compatible) config schema and a factory, add the subpath to `packages/providers/package.json` exports, and call `registry.register(descriptor)` at app bootstrap.

**Middleware** (LLM only) — `registry.use(middleware)` adds a global interceptor wrapping every provider's `complete()`. Middleware signature: `(next: CompletionFn) => CompletionFn`. Use `async function*` to yield chunks and wrap with try/finally for cleanup.

**`ConfigSchema<T>`** is our own minimal interface (`{ parse(data: unknown): T }`) — not coupled to Zod. Any validation library satisfies it.

**`LocalASRProvider`** (sherpa-onnx) adds model management on top of the base `transcribe()`: `listModels()`, `downloadModel(id, signal?)` returning `AsyncIterable<DownloadProgress>`, and `deleteModel(id)`. The `transcribe()` method accepts `AsyncIterable<Uint8Array>` (raw PCM frames at 16kHz) to stay environment-agnostic.

Provider instances run in the **Electron main process** (Node.js). Streaming results must cross the IPC boundary to reach the renderer — this wiring is not yet implemented.
