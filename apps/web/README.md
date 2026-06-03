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

## Analytics & Search Console

Analytics and Search Console verification are **env-driven** — no IDs live in the
repo (it is public, and a hardcoded GA id would make forks report into our
property). Set these in **Vercel → Settings → Environment Variables**
(Production + Preview). When unset, nothing is rendered, so local dev and previews
stay clean.

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_GA_ID` | GA4 Measurement ID (`G-XXXXXXXXXX`). Loaded via `@next/third-parties/google`. | [analytics.google.com](https://analytics.google.com) → Admin → Data streams → Web (`https://openbroca.com`) → Measurement ID. |
| `SITE_GOOGLE_SITE_VERIFICATION` | Google Search Console "HTML tag" token (the `content` value). Rendered as `<meta name="google-site-verification">`. | [search.google.com/search-console](https://search.google.com/search-console) → add a `https://openbroca.com` URL-prefix property → **HTML tag** method. |

For local testing, put them in an untracked `apps/web/.env.local` (the `.env*`
files are gitignored):

```bash
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
SITE_GOOGLE_SITE_VERIFICATION=your-token
```

### Verifying Search Console

The `SITE_GOOGLE_SITE_VERIFICATION` meta tag is one option. More robust
alternatives that need **no code**:

- **Domain property (recommended):** verify by DNS TXT record in Vercel DNS / the
  registrar. Covers the apex, `www`, and all subdomains, and survives redeploys.
- **Via Google Analytics:** once `NEXT_PUBLIC_GA_ID` is live under the same Google
  account, GSC can verify through the "Google Analytics" method.

After verifying, submit `https://openbroca.com/sitemap.xml` under **GSC →
Sitemaps**, and link GA4 ↔ GSC (**GA4 Admin → Product links → Search Console
links**) to surface query data in GA4.
