# CLAUDE.md

Guidance for Claude Code and agentic coding tools working in this repository.

## Project Shape

OpenBroca is a pnpm/Turborepo monorepo.

```text
apps/
  desktop/              Electron + React + TypeScript desktop app
packages/
  app-identity/         Active app/window identity helpers
  audio-capture/        Audio capture primitives
  providers/            ASR/LLM contracts, registries, and implementations
  ui/                   Shared React component library
  eslint-config/        Shared ESLint config
  tailwind-config/      Shared Tailwind CSS base
  typescript-config/    Shared TypeScript configs
```

## Commands

Run commands from the repository root unless a task specifically needs an app/package directory.

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm check
```

Package-scoped examples:

```bash
pnpm --filter openbroca-desktop dev
pnpm --filter openbroca-desktop build
pnpm --filter openbroca-desktop typecheck
pnpm --filter @openbroca/providers test
pnpm --filter @openbroca/ui typecheck
```

Add shadcn components from `apps/desktop/`:

```bash
pnpm dlx shadcn add <component>
```

## Architecture

The desktop app uses Electron with three process areas:

| Directory                    | Process  | Role                                                                  |
| ---------------------------- | -------- | --------------------------------------------------------------------- |
| `apps/desktop/src/main/`     | Main     | Windows, tray, shortcuts, provider runtime, persistence, IPC handlers |
| `apps/desktop/src/preload/`  | Preload  | Typed `contextBridge` APIs for the renderer                           |
| `apps/desktop/src/renderer/` | Renderer | React SPA, routes, stores, UI                                         |

Renderer-to-main communication should normally use tRPC over the custom Electron IPC link:

```text
Renderer trpc hook/client
  -> ipcLink
  -> window.trpc from preload
  -> ipcMain.handle
  -> main tRPC router
```

Add new tRPC procedures by creating a router under `apps/desktop/src/main/trpc/routers/`, registering it in `apps/desktop/src/main/trpc/router.ts`, and consuming it through renderer `trpc` hooks or `trpcClient`.

Use `.mutation()` for write operations. Subscriptions should use async generators on the server side.

## State And Secrets

`electron-store` runs in the main process and is the source of truth for persisted app state. Renderer Zustand stores should use `createPersistedStore`.

Provider secrets and OAuth credentials should use secure OS-backed storage. Never commit real credentials, `.env` files, certificates, local model artifacts, or generated bundles.

## Provider Platform

Provider code lives in `packages/providers` and is consumed directly as TypeScript source.

- LLM exports live under `@openbroca/providers/llm`.
- ASR exports live under `@openbroca/providers/asr`.
- Provider descriptors include a config schema and factory.
- LLM middleware wraps `complete()` through `(next: CompletionFn) => CompletionFn`.
- Local ASR providers expose model management APIs in addition to recognition.

When adding a provider, implement the relevant contract, export a descriptor, add a package export, and register the descriptor during app bootstrap.

## Frontend Notes

The renderer uses React Router, Tailwind CSS v4, shared UI components, shadcn-style components, and Hugeicons/Lucide icons. Tailwind theme variables live in `apps/desktop/src/renderer/src/styles/globals.css`; there is no `tailwind.config.js`.

Keep desktop app screens functional and dense enough for repeated use. Avoid landing-page-style UI inside the app.

## Repository Hygiene

Do not add generated output or personal tooling state:

- `node_modules/`
- `out/`
- `dist/`
- `.turbo/`
- `.claude/`
- `.agents/`
- `.superpowers/`
- `.worktrees/`
- `.DS_Store`
- `.env*`

Before a public PR, run:

```bash
pnpm check
trufflehog git file://$(pwd) --no-update
```

## Editing Expectations

- Prefer existing patterns and local helper APIs.
- Keep changes scoped to the request.
- Add or update tests when behavior changes.
- Do not revert unrelated user changes in the working tree.
- Use `rg` for searching and keep generated/churn-only changes out of commits.
