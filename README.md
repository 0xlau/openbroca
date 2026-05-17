<a id="readme-top"></a>

<br />
<div align="center">
  <img src="docs/assets/logo.svg" alt="OpenBroca logo" width="260" />

  <p align="center">
    An open-source desktop voice assistant for turning speech into useful text, actions, and workflows across your computer.
    <br />
    <a href="docs/ARCHITECTURE.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/0xlau/openbroca/releases/latest">Download</a>
    ·
    <a href="https://github.com/0xlau/openbroca/issues/new?template=bug_report.yml">Report Bug</a>
    ·
    <a href="https://github.com/0xlau/openbroca/issues/new?template=feature_request.yml">Request Feature</a>
  </p>
</div>

[![Contributors](https://img.shields.io/github/contributors/0xlau/openbroca.svg)](https://github.com/0xlau/openbroca/graphs/contributors)
[![Forks](https://img.shields.io/github/forks/0xlau/openbroca.svg)](https://github.com/0xlau/openbroca/network/members)
[![Stargazers](https://img.shields.io/github/stars/0xlau/openbroca.svg)](https://github.com/0xlau/openbroca/stargazers)
[![Issues](https://img.shields.io/github/issues/0xlau/openbroca.svg)](https://github.com/0xlau/openbroca/issues)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![CI](https://github.com/0xlau/openbroca/actions/workflows/ci.yml/badge.svg)](https://github.com/0xlau/openbroca/actions/workflows/ci.yml)
[![Release](https://github.com/0xlau/openbroca/actions/workflows/release.yml/badge.svg)](https://github.com/0xlau/openbroca/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/0xlau/openbroca)](https://github.com/0xlau/openbroca/releases/latest)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-39-47848f.svg)](https://www.electronjs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange.svg)](https://pnpm.io/)

## Table Of Contents

1. [About The Project](#about-the-project)
   - [Built With](#built-with)
   - [Status](#status)
2. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
3. [Usage](#usage)
4. [Project Structure](#project-structure)
5. [Architecture](#architecture)
6. [Roadmap](#roadmap)
7. [Releasing](#releasing)
8. [Security](#security)
9. [Contributing](#contributing)
10. [License](#license)
11. [Contact](#contact)
12. [Acknowledgments](#acknowledgments)

## About The Project

OpenBroca is a desktop-first voice assistant built for people who want spoken thoughts to become clean, useful output without being locked into one speech or language model provider.

It started from a personal itch: tools like Typeless show how delightful desktop dictation can be, but I kept running into places where the behavior I wanted was not customizable. OpenBroca is my attempt to solve that problem for myself first, in the open, with the hope that the same flexibility can help other people shape voice input around their own workflows too.

It captures audio locally, routes transcription and LLM work through provider registries, and delivers the final text back into the desktop context where you were working. The app is built with Electron, React, TypeScript, tRPC over IPC, and a provider-first monorepo architecture.

Why this project exists:

- Speak naturally, then let OpenBroca transcribe, clean up, and deliver text where you need it.
- Use local or cloud ASR providers through one shared provider contract.
- Connect LLM providers through a registry that supports model selection, provider settings, and middleware.
- Keep provider credentials in OS-backed secure storage.
- Build desktop-first automation without coupling the app to one vendor or hosted backend.

Product screenshots and demo media will be added as the first public release stabilizes.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [electron-vite](https://electron-vite.org/)
- [tRPC](https://trpc.io/)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Turborepo](https://turbo.build/repo)
- [pnpm](https://pnpm.io/)
- [Vitest](https://vitest.dev/)
- [electron-builder](https://www.electron.build/)
- [release-please](https://github.com/googleapis/release-please)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Status

OpenBroca is pre-1.0 software. The repository is active, usable for development, and still evolving. Expect provider contracts, desktop UX details, and release packaging to keep moving while the project matures.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

You can use OpenBroca as a packaged desktop app or run it from source for development.

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or newer
- [pnpm](https://pnpm.io/) 10.32.1 or newer
- macOS, Windows, or Linux for local development
- Platform build tools required by native Electron dependencies such as `keytar`, `uiohook-napi`, and `audify`

Install pnpm if you do not already have it:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

### Installation

#### Download A Release

Download the latest installer from the [Releases page](https://github.com/0xlau/openbroca/releases/latest).

Current release targets:

- macOS Apple Silicon and Intel: `.dmg`
- Windows x64: `.exe`

macOS and Windows builds may be unsigned while the project is early. Your operating system may show the usual unknown publisher warning.

#### Run From Source

1. Clone the repository:

   ```bash
   git clone https://github.com/0xlau/openbroca.git
   cd openbroca
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start the desktop app:

   ```bash
   pnpm dev
   ```

4. Run the main quality checks:

   ```bash
   pnpm check
   pnpm test
   ```

5. Build the app:

   ```bash
   pnpm build
   ```

6. Create desktop bundles:

   ```bash
   pnpm bundle:mac
   pnpm bundle:win
   pnpm bundle:linux
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

1. Launch OpenBroca.
2. Complete the desktop permission onboarding for microphone access and platform-specific text delivery.
3. Select a microphone from the sidebar or tray menu.
4. Configure ASR and LLM providers in the app.
5. Use the configured shortcut to start dictation, then speak naturally.
6. Let OpenBroca transcribe, clean up, and deliver the result to your active app or clipboard fallback.

Default shortcuts and provider setup may change before the 1.0 release. See [docs/PRIVACY.md](docs/PRIVACY.md) for data-handling notes and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the desktop processes fit together.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```text
apps/
  desktop/              Electron + React desktop app
packages/
  app-identity/         Cross-platform active app/window identification
  audio-capture/        Audio capture primitives
  providers/            ASR/LLM provider contracts, registries, implementations
  ui/                   Shared React component library
  eslint-config/        Shared ESLint config
  tailwind-config/      Shared Tailwind CSS base
  typescript-config/    Shared TypeScript configs
docs/
  ARCHITECTURE.md       System overview
  PRIVACY.md            Data and credential handling notes
  RELEASING.md          Release process
  ROADMAP.md            Current direction
```

Common workspace commands:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

Target a specific package:

```bash
pnpm --filter openbroca-desktop dev
pnpm --filter @openbroca/providers test
pnpm --filter @openbroca/ui typecheck
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Architecture

The desktop app uses Electron's main, preload, and renderer processes under `apps/desktop/src`.

Renderer-to-main communication goes through tRPC over a custom Electron IPC transport rather than HTTP:

```text
Renderer
  -> tRPC client
  -> preload contextBridge
  -> ipcMain handler
  -> main-process tRPC router
```

The provider platform lives in `packages/providers` and is consumed directly as TypeScript source by the desktop app.

- LLM providers implement `LLMProvider` and register descriptors with `LLMProviderRegistry`.
- ASR providers implement `ASRProvider`, `StreamingASRProvider`, or `LocalASRProvider`.
- Provider configuration uses a minimal `ConfigSchema<T>` interface, so Zod or any compatible parser can be used.
- LLM middleware can wrap provider completion for cross-cutting behavior.

Read the full system overview in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [ ] Stabilize the core desktop dictation loop.
- [ ] Harden macOS and Windows text delivery.
- [ ] Expand provider setup flows.
- [ ] Improve local ASR model management.
- [ ] Add richer update and release verification.
- [ ] Publish polished screenshots and demo media.
- [ ] Document provider authoring in more depth.

See [docs/ROADMAP.md](docs/ROADMAP.md) and the [open issues](https://github.com/0xlau/openbroca/issues) for proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Releasing

OpenBroca uses [release-please](https://github.com/googleapis/release-please) to manage version bumps, changelog entries, tags, and GitHub Releases from Conventional Commits.

The release workflow builds macOS and Windows installers, uploads them to GitHub Releases, and publishes update metadata for `electron-updater`.

Read the release checklist in [docs/RELEASING.md](docs/RELEASING.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Security

Do not commit API keys, model provider credentials, local `.env` files, desktop build artifacts, or agent-local state. The repository is configured to ignore common local and secret-bearing files.

Before opening a PR, run a local secret scan:

```bash
trufflehog git file://$(pwd) --no-update
trufflehog filesystem . --no-update --force-skip-binaries --force-skip-archives
```

If you discover a vulnerability, please follow [SECURITY.md](SECURITY.md) and report it privately.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Contributions are welcome, especially provider integrations, cross-platform desktop reliability improvements, accessibility fixes, and focused tests.

1. Fork the project.
2. Create your feature branch:

   ```bash
   git checkout -b feat/amazing-feature
   ```

3. Commit your changes using Conventional Commits:

   ```bash
   git commit -m "feat: add amazing feature"
   ```

4. Push to the branch:

   ```bash
   git push origin feat/amazing-feature
   ```

5. Open a pull request.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening issues or pull requests.

### Top Contributors

<a href="https://github.com/0xlau/openbroca/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=0xlau/openbroca" alt="Top contributors" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Project maintainer: [Timothy Lau](https://github.com/0xlau)

Project link: [https://github.com/0xlau/openbroca](https://github.com/0xlau/openbroca)

For bugs and feature requests, use [GitHub Issues](https://github.com/0xlau/openbroca/issues/new/choose).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) for the README structure.
- [Electron](https://www.electronjs.org/) and [electron-builder](https://www.electron.build/) for desktop packaging.
- [Turborepo](https://turbo.build/repo) and [pnpm](https://pnpm.io/) for monorepo tooling.
- [release-please](https://github.com/googleapis/release-please) for release automation.
- Everyone who files issues, tests builds, improves providers, and helps make OpenBroca calmer and more useful.

<p align="right">(<a href="#readme-top">back to top</a>)</p>
