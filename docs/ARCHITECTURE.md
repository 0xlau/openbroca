# Architecture

OpenBroca is a pnpm/Turborepo monorepo centered on an Electron desktop app and a provider platform for ASR and LLM integrations.

## System Overview

```text
Desktop UI
  React renderer
  Zustand stores
  tRPC React Query hooks
        |
        v
Preload bridge
  contextBridge exposes typed APIs
        |
        v
Main process
  tRPC routers
  Electron windows, tray, shortcuts
  electron-store persistence
  provider runtime
        |
        v
Provider packages
  ASR providers
  LLM providers
  local model management
```

## Electron Processes

`apps/desktop/src/main` contains the Electron main process. It owns windows, IPC handlers, persistence, provider runtime setup, audio/session coordination, permissions, shortcuts, and OS automation.

`apps/desktop/src/preload` exposes a narrow typed bridge to the renderer through `contextBridge`.

`apps/desktop/src/renderer` contains the React application. It uses React Router, TanStack Query, tRPC hooks, Zustand stores, and shared UI components.

## IPC And tRPC

Renderer-to-main communication uses tRPC over a custom Electron IPC transport.

```text
React component
  -> trpc hooks
  -> ipcLink
  -> window.trpc from preload
  -> ipcMain.handle
  -> main tRPC router
```

Use tRPC for new renderer/main APIs unless the use case genuinely does not fit request/response or subscription semantics.

## State

Persistent state is owned by the main process through `electron-store`. Renderer Zustand stores use `createPersistedStore` to hydrate from main process state and stay synchronized through the `store.watch` tRPC subscription.

Secrets and provider credentials should use secure OS-backed storage rather than plain persisted store entries.

## Providers

`packages/providers` defines:

- Shared errors, schemas, and registry primitives.
- LLM contracts, registries, middleware, and provider descriptors.
- ASR contracts, registries, and provider descriptors.
- Local ASR model management contracts.

Provider descriptors expose a typed config schema and factory. The desktop app registers descriptors during bootstrap and creates provider instances in the Electron main process.

## Packages

- `@openbroca/app-identity`: active application/window identification.
- `@openbroca/audio-capture`: audio capture primitives.
- `@openbroca/providers`: provider platform and implementations.
- `@openbroca/ui`: shared UI components.
- `@openbroca/eslint-config`: shared lint config.
- `@openbroca/tailwind-config`: shared CSS base.
- `@openbroca/typescript-config`: shared TypeScript configs.

## Testing

Vitest is used across testable packages. Tests live close to source in `src/**/__tests__/*.test.ts` or component-adjacent `*.test.tsx` files.
