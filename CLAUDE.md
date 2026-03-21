# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Structure

This is a **Turborepo monorepo** managed with pnpm workspaces.

```
apps/
  desktop/          ← Electron + React + TypeScript app
packages/
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
pnpm --filter @openbroca/ui typecheck   # Typecheck the shared UI package
```

No test runner is configured yet.

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
