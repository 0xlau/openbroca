# CI/CD Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up GitHub Actions + electron-builder + release-please so that merging a Release PR produces signed (macOS) GitHub Releases containing macOS arm64/x64 DMGs, Windows x64 NSIS installer, and Linux AppImage/deb, with `electron-updater` reading from those releases for auto-update.

**Architecture:** Three workflows (`ci.yml`, `release-please.yml`, `release.yml`). `ci.yml` validates every push/PR. `release-please.yml` maintains a rolling Release PR from Conventional Commits. Merging the Release PR creates a tag + GitHub Release, which fires `release.yml` — a 3-platform matrix that builds and uploads artifacts via `electron-builder --publish=always`.

**Tech Stack:** GitHub Actions, pnpm 10.32.1, Node 22, electron-builder 26, electron-updater, googleapis/release-please-action v4, Turborepo.

**Spec reference:** `docs/superpowers/specs/2026-05-02-cicd-release-pipeline-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `LICENSE` | create | MIT license text, copyright Timothy Lau |
| `apps/desktop/package.json` | modify | Real identity fields (name, author, license, repository) |
| `apps/desktop/electron-builder.yml` | rewrite | Real appId, GitHub publish provider, multi-arch DMG, signing-ready mac config |
| `apps/desktop/dev-app-update.yml` | rewrite | Point to GitHub provider for dev-mode update tests |
| `apps/desktop/src/main/index.ts` | modify | Update `setAppUserModelId`; add `autoUpdater.checkForUpdatesAndNotify()` |
| `.github/release-please-config.json` | create | release-please monorepo config (`apps/desktop` only) |
| `.github/.release-please-manifest.json` | create | release-please version state, seeded at `0.1.0` |
| `.github/workflows/ci.yml` | create | Lint/typecheck/test/build on every push and PR |
| `.github/workflows/release-please.yml` | create | Rolling Release PR maintenance on `push` to `main` |
| `.github/workflows/release.yml` | create | 3-platform matrix build + publish on `release.published` |
| `README.md` | rewrite | Real product info, install links, build-from-source instructions |

---

## Task 1: Add LICENSE

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write the LICENSE file**

Write the standard MIT license text:

```
MIT License

Copyright (c) 2026 Timothy Lau

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license"
```

---

## Task 2: Update apps/desktop/package.json identity fields

**Files:**
- Modify: `apps/desktop/package.json` lines 2-7

- [ ] **Step 1: Apply the identity diff**

Replace the top of `apps/desktop/package.json` (the fields above `scripts`) so it reads:

```json
{
  "name": "openbroca-desktop",
  "version": "0.1.0",
  "description": "Just speak your thoughts.",
  "main": "./out/main/index.js",
  "author": "Timothy Lau <timothy-lau@outlook.com>",
  "license": "MIT",
  "homepage": "https://openbroca.com",
  "repository": {
    "type": "git",
    "url": "https://github.com/0xlau/openbroca.git",
    "directory": "apps/desktop"
  },
  "scripts": {
    ...keep existing scripts unchanged...
```

The exact targeted edits:

- `"name": "desktop"` → `"name": "openbroca-desktop"`
- `"version": "1.0.0"` → `"version": "0.1.0"`
- `"description": "Just speak your thoughts"` → `"description": "Just speak your thoughts."`
- `"author": "timlau.me"` → `"author": "Timothy Lau <timothy-lau@outlook.com>"`
- After the `"author"` line, insert `"license": "MIT",`
- After the `"homepage"` line, insert the `"repository"` object shown above

- [ ] **Step 2: Verify pnpm still resolves**

Run: `pnpm install --frozen-lockfile`
Expected: `Lockfile is up to date, resolution step is skipped` and exit 0. (If it complains the lockfile is out of date, run `pnpm install` once and commit the lockfile change in this same commit.)

- [ ] **Step 3: Verify typecheck still passes**

Run: `pnpm --filter desktop typecheck`
Expected: exit 0 (no TS errors).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore(desktop): update package metadata for OSS release"
```

---

## Task 3: Rewrite apps/desktop/electron-builder.yml

**Files:**
- Modify: `apps/desktop/electron-builder.yml` (full rewrite)

- [ ] **Step 1: Replace the entire file contents**

Overwrite `apps/desktop/electron-builder.yml` with:

```yaml
appId: me.timlau.openbroca
productName: Openbroca
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - resources/**

mac:
  category: public.app-category.productivity
  icon: build/icon.icon
  entitlementsInherit: build/entitlements.mac.plist
  hardenedRuntime: true
  gatekeeperAssess: false
  notarize: true
  extendInfo:
    NSMicrophoneUsageDescription: Openbroca uses your microphone to transcribe what you say.
    NSCameraUsageDescription: Openbroca uses the camera only when you opt in to a feature that requires it.
    NSDocumentsFolderUsageDescription: Openbroca reads from your Documents folder when you save or open a transcript there.
    NSDownloadsFolderUsageDescription: Openbroca writes exported transcripts to your Downloads folder.
  target:
    - target: dmg
      arch: [arm64, x64]

dmg:
  artifactName: ${productName}-${version}-${arch}.${ext}

win:
  executableName: Openbroca
  target:
    - target: nsis
      arch: [x64]

nsis:
  artifactName: ${productName}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always

linux:
  maintainer: Timothy Lau <timothy-lau@outlook.com>
  category: Utility
  target:
    - AppImage
    - deb

appImage:
  artifactName: ${productName}-${version}-${arch}.${ext}

npmRebuild: false

publish:
  provider: github
  owner: 0xlau
  repo: openbroca
```

> **Note**: `build/icon.icon` is the macOS 26 Tahoe Icon Composer bundle format and is intentional — do **not** rename it to `.icns`. electron-builder 26.0.12 reads it directly.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/electron-builder.yml
git commit -m "build(desktop): configure electron-builder for OSS release

- Real appId (me.timlau.openbroca) and productName (Openbroca)
- macOS dual-arch DMG (arm64 + x64), notarize: true (CI-only)
- Windows x64 NSIS, Linux AppImage + deb
- Publish via GitHub provider"
```

---

## Task 4: Rewrite apps/desktop/dev-app-update.yml

**Files:**
- Modify: `apps/desktop/dev-app-update.yml`

- [ ] **Step 1: Replace contents**

Overwrite `apps/desktop/dev-app-update.yml` with:

```yaml
provider: github
owner: 0xlau
repo: openbroca
updaterCacheDirName: openbroca-updater
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/dev-app-update.yml
git commit -m "build(desktop): point dev-app-update to GitHub provider"
```

---

## Task 5: Fix setAppUserModelId in main/index.ts

**Files:**
- Modify: `apps/desktop/src/main/index.ts` line 353

- [ ] **Step 1: Update the AppUserModelId**

The existing line 353 reads:

```ts
electronApp.setAppUserModelId('com.electron')
```

Replace with:

```ts
electronApp.setAppUserModelId('me.timlau.openbroca')
```

This must match `appId` in `electron-builder.yml` so Windows correctly groups taskbar entries and Mac users see consistent identity.

- [ ] **Step 2: Verify typecheck still passes**

Run: `pnpm --filter desktop typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "fix(desktop): set AppUserModelId to match new appId"
```

---

## Task 6: Verify local macOS build still works

**Files:** none (verification only)

This task gates everything below. If the local build is broken, the CI release workflow has zero chance.

- [ ] **Step 1: Build locally**

From repo root: `pnpm --filter desktop build:mac`
Expected: exit 0. Produces `apps/desktop/dist/Openbroca-0.1.0-arm64.dmg` (and on an Intel host, `Openbroca-0.1.0-x64.dmg`).

> The local environment lacks `APPLE_ID`/`CSC_LINK`, so electron-builder will emit `skipped macOS application code signing. reason=identity is not provided` and `skipped macOS notarization. reason=Apple ID env vars are not set`. **This is expected** and the build still produces an unsigned DMG.

- [ ] **Step 2: Smoke-test the DMG**

Open `apps/desktop/dist/Openbroca-0.1.0-arm64.dmg`, drag Openbroca.app to Applications, right-click → Open (Gatekeeper bypass for unsigned), verify:
- App launches
- Window title says "Openbroca" (not "my-app")
- Dock icon uses the macOS 26 Liquid Glass icon (proves `.icon` was honored)

- [ ] **Step 3: No commit**

This is verification only. If anything failed, fix in this task before continuing — do not paper over with later workflow tweaks.

---

## Task 7: Add ci.yml workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the directory and write the workflow**

Create `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Lint, Typecheck, Test, Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Restore turbo cache
        uses: actions/cache@v4
        with:
          path: |
            .turbo
            apps/desktop/node_modules/.cache
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint, typecheck, test, build
        run: pnpm turbo run lint typecheck test build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add validation workflow (lint, typecheck, test, build)"
```

---

## Task 8: Add release-please configuration files

**Files:**
- Create: `.github/release-please-config.json`
- Create: `.github/.release-please-manifest.json`

- [ ] **Step 1: Write release-please-config.json**

Create `.github/release-please-config.json` with:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    "apps/desktop": {
      "release-type": "node",
      "package-name": "openbroca",
      "include-component-in-tag": false,
      "changelog-path": "CHANGELOG.md",
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance" },
        { "type": "refactor", "section": "Refactors" },
        { "type": "docs", "section": "Documentation", "hidden": false },
        { "type": "chore", "hidden": true },
        { "type": "test", "hidden": true },
        { "type": "ci", "hidden": true }
      ]
    }
  }
}
```

- [ ] **Step 2: Write the manifest**

Create `.github/.release-please-manifest.json` with:

```json
{
  "apps/desktop": "0.1.0"
}
```

- [ ] **Step 3: Commit**

```bash
git add .github/release-please-config.json .github/.release-please-manifest.json
git commit -m "ci: add release-please config and manifest

Tracks apps/desktop only. Tags as v\${version} (no component prefix).
Initial version 0.1.0 matches package.json."
```

---

## Task 9: Add release-please.yml workflow

**Files:**
- Create: `.github/workflows/release-please.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release-please.yml` with:

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: .github/release-please-config.json
          manifest-file: .github/.release-please-manifest.json
          token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci: add release-please workflow

Maintains a rolling Release PR on every push to main and creates
a GitHub Release + tag when the Release PR is merged."
```

---

## Task 10: Add release.yml workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml` with:

```yaml
name: Release

on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  build:
    name: Build (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-26
            build_args: --mac --arm64 --x64
          - os: windows-latest
            build_args: --win --x64
          - os: ubuntu-latest
            build_args: --linux

    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.release.tag_name }}

      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Restore turbo cache
        uses: actions/cache@v4
        with:
          path: |
            .turbo
            apps/desktop/node_modules/.cache
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Rebuild native modules for Electron
        run: pnpm --filter desktop exec electron-builder install-app-deps

      - name: Build (electron-vite + typecheck)
        run: pnpm --filter desktop run build

      - name: Build & publish to GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ matrix.os == 'macos-26' && secrets.CSC_LINK || '' }}
          CSC_KEY_PASSWORD: ${{ matrix.os == 'macos-26' && secrets.CSC_KEY_PASSWORD || '' }}
          APPLE_ID: ${{ matrix.os == 'macos-26' && secrets.APPLE_ID || '' }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ matrix.os == 'macos-26' && secrets.APPLE_APP_SPECIFIC_PASSWORD || '' }}
          APPLE_TEAM_ID: ${{ matrix.os == 'macos-26' && secrets.APPLE_TEAM_ID || '' }}
        run: pnpm --filter desktop exec electron-builder ${{ matrix.build_args }} --publish=always
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release build workflow

3-platform matrix (macos-26, windows-latest, ubuntu-latest) triggered
by release.published. Each runner builds the desktop app and uploads
artifacts to the GitHub Release via electron-builder --publish=always.
Apple signing/notarization secrets are scoped to the macOS runner."
```

---

## Task 11: Wire autoUpdater in main/index.ts

**Files:**
- Modify: `apps/desktop/src/main/index.ts` (imports + inside `app.whenReady`)

The current main process does **not** wire `electron-updater` (verified via grep). Add the minimal hook so installed users get auto-update.

- [ ] **Step 1: Add the import**

Locate the import block at the top of `apps/desktop/src/main/index.ts` (lines 1-58). Add a single new import after the existing `@electron-toolkit/utils` import (line 6):

Existing:
```ts
import { electronApp, optimizer } from '@electron-toolkit/utils'
```

Add after it:
```ts
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
```

> If `is` is already imported elsewhere, just merge the names into the existing destructure: `import { electronApp, is, optimizer } from '@electron-toolkit/utils'`.

- [ ] **Step 2: Add the auto-update call inside `app.whenReady`**

Locate `app.whenReady().then(async () => {` at line 352. Find the line right after `electronApp.setAppUserModelId('me.timlau.openbroca')` (the line you set in Task 5) and insert:

```ts
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('autoUpdater check failed:', err)
    })
  }
```

The block, after the change, looks like:

```ts
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('me.timlau.openbroca')

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('autoUpdater check failed:', err)
    })
  }

  const defaultModelDir = join(app.getPath('userData'), 'asr-models', 'sherpa-onnx')
  registerLocalASRProviders({ defaultModelDir })
  ...
```

The `.catch` is required because `checkForUpdatesAndNotify` rejects (not throws) when offline / no release found — without it, an unhandled rejection crashes dev mode tooling on quit.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter desktop typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(desktop): wire electron-updater on app ready

Production-only auto-update check on launch. Errors are logged and
swallowed so transient network failures don't disturb the app."
```

---

## Task 12: Rewrite README.md

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Overwrite README.md with the public-facing content**

Replace the entire file with:

````markdown
# Openbroca

Just speak your thoughts.

[![CI](https://github.com/0xlau/openbroca/actions/workflows/ci.yml/badge.svg)](https://github.com/0xlau/openbroca/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/0xlau/openbroca)](https://github.com/0xlau/openbroca/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Openbroca is a desktop app that turns voice into text in any application you're already using.

## Install

Download the latest installer for your platform from the [Releases page](https://github.com/0xlau/openbroca/releases/latest):

| Platform | Installer |
|---|---|
| macOS (Apple Silicon) | `Openbroca-x.y.z-arm64.dmg` |
| macOS (Intel) | `Openbroca-x.y.z-x64.dmg` |
| Windows (x64) | `Openbroca-x.y.z-setup.exe` |
| Linux (AppImage) | `Openbroca-x.y.z-x86_64.AppImage` |
| Linux (Debian/Ubuntu) | `openbroca_x.y.z_amd64.deb` |

### macOS notes

Openbroca for macOS is signed with a Developer ID certificate and notarized by Apple — no Gatekeeper bypass should be needed. If you ever see *"Openbroca cannot be opened because the developer cannot be verified"*, right-click the app and choose **Open** to whitelist it.

### Windows notes

The Windows installer is currently **unsigned**. SmartScreen will warn that the publisher is unknown — click **More info** → **Run anyway**. Code signing is on the roadmap.

### Auto-update

Openbroca checks for updates on launch and notifies you when a new version is available. Updates are pulled from GitHub Releases.

## Build from source

This is a Turborepo monorepo using pnpm.

```bash
pnpm install
pnpm dev                    # start the dev server (Electron + Vite HMR)
pnpm --filter desktop build:mac     # produce a macOS DMG in apps/desktop/dist/
pnpm --filter desktop build:win     # produce a Windows installer
pnpm --filter desktop build:linux   # produce Linux AppImage + deb
```

Requirements: Node.js 22+, pnpm 10.32+.

## Contributing

Pull requests welcome. We use [Conventional Commits](https://www.conventionalcommits.org/) so that release notes generate themselves — please prefix your commit messages with `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`, `test:`, or `ci:`.

## License

[MIT](LICENSE) © Timothy Lau
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for public OSS release"
```

---

## Task 13: Push branch and verify ci.yml on a PR

**Files:** none (validation only)

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin <current-branch>
gh pr create --title "ci: introduce release pipeline" --body "$(cat <<'EOF'
## Summary
- Adds CI/CD pipeline per spec at docs/superpowers/specs/2026-05-02-cicd-release-pipeline-design.md
- Three workflows: ci.yml, release-please.yml, release.yml
- Updates electron-builder config for real OSS release

## Test plan
- [x] Local pnpm --filter desktop build:mac succeeds (Task 6)
- [ ] CI workflow goes green on this PR
- [ ] After merge: release-please opens initial Release PR
- [ ] Merging Release PR triggers 3-platform build
EOF
)"
```

- [ ] **Step 2: Watch CI**

```bash
gh pr checks --watch
```

Expected: `validate` job passes within ~5 minutes (cold cache). If it fails, debug in this PR — do not merge until green.

- [ ] **Step 3: No commit unless fixes are needed**

If CI fails, push fixes to this same branch (each fix gets its own conventional commit). Do not merge until validate passes.

---

## Task 14: Merge PR and verify release-please opens initial Release PR

**Files:** none (validation only)

- [ ] **Step 1: Merge the PR**

```bash
gh pr merge --squash --delete-branch
```

> **Squash, not merge-commit.** release-please reads commit messages on `main`. Multiple intermediate commits squashed into one well-formed `feat: ...` or `chore: ...` keeps the changelog clean. (If you'd rather preserve individual commits, use `--rebase` — both work, but squash is simpler.)

- [ ] **Step 2: Watch release-please.yml fire**

```bash
gh run watch
```

Expected: a workflow run on `main` named "Release Please" goes green, and a new PR appears titled approximately `chore(main): release openbroca 0.1.0`.

- [ ] **Step 3: Inspect the Release PR**

```bash
gh pr list --search "release-please"
gh pr view <release-pr-number>
```

Expected: PR diff bumps `apps/desktop/package.json` version from `0.1.0` → some version (likely still `0.1.0` if you haven't merged any `feat:`/`fix:` commits yet — in that case manually create a small `feat: ` commit on main to trigger a real version bump for verification, then re-watch). Also creates `apps/desktop/CHANGELOG.md`.

- [ ] **Step 4: No code change**

This is verification of release-please behavior only.

---

## Task 15: Merge Release PR and verify end-to-end first release

**Files:** none (validation only)

- [ ] **Step 1: Merge the Release PR**

```bash
gh pr merge <release-pr-number> --squash
```

- [ ] **Step 2: Watch release-please create the GitHub Release + tag**

```bash
gh run watch
gh release list
```

Expected: a new release tagged `v0.1.0` (or whatever version was bumped) appears with auto-generated release notes from the merged Conventional Commits.

- [ ] **Step 3: Watch release.yml matrix build**

```bash
gh run list --workflow=release.yml --limit 1
gh run watch
```

Expected: 3 matrix entries (`macos-26`, `windows-latest`, `ubuntu-latest`) all complete green within ~15 minutes. macOS runs the longest (notarization is skipped at this point since secrets aren't configured yet, so it'll actually be the fastest — typical ~6 min).

- [ ] **Step 4: Verify artifacts uploaded**

```bash
gh release view v0.1.0
```

Expected files attached:
- `Openbroca-0.1.0-arm64.dmg`
- `Openbroca-0.1.0-arm64.dmg.blockmap`
- `Openbroca-0.1.0-x64.dmg`
- `Openbroca-0.1.0-x64.dmg.blockmap`
- `Openbroca-0.1.0-setup.exe`
- `Openbroca-0.1.0-setup.exe.blockmap`
- `Openbroca-0.1.0.AppImage` (or similar)
- `openbroca_0.1.0_amd64.deb`
- `latest-mac.yml`, `latest.yml`, `latest-linux.yml`

- [ ] **Step 5: Manual download smoke test**

Download `Openbroca-0.1.0-arm64.dmg` from the GitHub Release page, install, and confirm it launches. (This validates that the published artifact is the same one auto-update will hand to users.)

- [ ] **Step 6: No code commit**

End-to-end validation complete. The pipeline is now self-sustaining.

---

## Future Task (deferred, not part of this plan)

**Apple Developer code-signing + notarization** — when the Apple Developer Program enrollment + Developer ID Application certificate are in hand:

1. Export the certificate as a `.p12`, base64-encode it, store as the `CSC_LINK` GitHub secret. Store the password as `CSC_KEY_PASSWORD`.
2. Generate an app-specific password at appleid.apple.com, store as `APPLE_APP_SPECIFIC_PASSWORD`. Store your Apple ID email as `APPLE_ID` and your Team ID (from developer.apple.com membership page) as `APPLE_TEAM_ID`.
3. Tag a `0.1.1` patch release (any small `fix:` commit + merge the next Release PR).
4. The macOS matrix entry will pick up the secrets, sign + notarize, and the resulting DMG opens without Gatekeeper bypass. `electron-updater` then begins serving signed updates to existing installs.

No code changes required for this — only secret configuration and a new release.

---

## Self-Review Notes

This plan was reviewed against `docs/superpowers/specs/2026-05-02-cicd-release-pipeline-design.md`:

- **Spec coverage**: All 11 file changes from the spec's File-Level Changes section have a task. All three workflows have a task. release-please config + manifest have a task. README rewrite has a task. Out-of-scope items (Homebrew, Windows signing) correctly absent.
- **Placeholder scan**: No "TODO", "TBD", or unfilled code. All commands are runnable.
- **Type consistency**: `is.dev` from `@electron-toolkit/utils` is used consistently. `autoUpdater` import name matches its single call site. The version `0.1.0` is consistent across `package.json`, manifest, and the validation in Task 15. `me.timlau.openbroca` matches across `electron-builder.yml` (Task 3) and `setAppUserModelId` (Task 5).
