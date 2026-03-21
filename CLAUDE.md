# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server (Electron + Vite HMR)
pnpm build            # Typecheck + build all processes
pnpm build:mac        # Build macOS distributable
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm typecheck        # Check both node and web TypeScript configs
pnpm typecheck:node   # Main/preload process types only
pnpm typecheck:web    # Renderer process types only
```

No test runner is configured yet.

## Architecture

This is an **Electron + React + TypeScript** desktop app built with [electron-vite](https://electron-vite.org/). The three Electron processes map directly to `src/` subdirectories:

| Directory | Process | Role |
|---|---|---|
| `src/main/` | Main | Electron entry, window creation, IPC handlers |
| `src/preload/` | Preload | Exposes `window.electron` and `window.api` to renderer via `contextBridge` |
| `src/renderer/` | Renderer | React SPA |

### Renderer (`src/renderer/src/`)

Path alias `@renderer` resolves to `src/renderer/src/`.

**Routing** — `react-router` v7 with `createHashRouter` (hash router required for Electron file protocol). Routes are defined in `router/index.tsx`. The root layout (`pages/root.tsx`) wraps all pages in a `SidebarProvider` + `AppSidebar` shell.

**Current pages**: Dashboard (index), Providers, Brocas, Dictionary, Skills, AboutMe.

**UI layer** — shadcn/ui components (style: `radix-maia`, base color: `mauve`) live in `components/ui/`. Icons use `@hugeicons/react`. Tailwind CSS v4 is configured entirely via `src/renderer/src/styles/globals.css` — there is no `tailwind.config.js`. CSS variables drive theming (light/dark via `.dark` class, managed by `ThemeProvider`).

**Adding shadcn components**: use `pnpm dlx shadcn add <component>` — the `components.json` aliases will place them correctly under `@renderer/components/ui/`.

### IPC pattern

Custom renderer→main APIs should be added to the `api` object in `src/preload/index.ts` (exposed via `contextBridge`) and typed in `src/preload/index.d.ts`. Main-side handlers go in `src/main/index.ts` using `ipcMain`.
