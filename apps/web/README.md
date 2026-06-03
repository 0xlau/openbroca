# openbroca-web

The marketing website for [OpenBroca](https://github.com/0xlau/openbroca) — an
open-source voice interface for the AI era.

Built with **Next.js (App Router)**, **React 19**, and **Tailwind CSS v4**.

## Develop

From the repository root:

```bash
pnpm install
pnpm --filter openbroca-web dev      # http://localhost:3000
```

Other scripts:

```bash
pnpm --filter openbroca-web build    # production build
pnpm --filter openbroca-web start    # serve the production build
pnpm --filter openbroca-web typecheck
```

## How downloads stay current

`src/lib/releases.ts` fetches the latest release from the GitHub Releases API at
build/ISR time (revalidated hourly) and resolves direct download links for each
platform asset (`*-arm64.dmg`, `*-x64.dmg`, `*.exe`, `*.AppImage`, `*.deb`). If
the API is unavailable, every button falls back to the
[releases page](https://github.com/0xlau/openbroca/releases/latest), so links are
never dead and the displayed version never goes stale.

## Deploy to Vercel

This app lives inside a pnpm + Turborepo monorepo, so point Vercel at this
subdirectory:

1. Import the `0xlau/openbroca` repository into the
   [`timothy-laus-projects`](https://vercel.com/timothy-laus-projects) team.
2. In **Project Settings → Build & Development**:
   - **Root Directory:** `apps/web`
   - **Framework Preset:** Next.js (auto-detected)
   - Install / build commands: leave as the Vercel defaults. Vercel detects the
     pnpm workspace and installs from the repo root automatically.
3. Add the production domain `openbroca.com` under **Settings → Domains**.

That's it — pushes to `main` deploy to production; pull requests get preview
URLs. No `vercel.json` is required.
