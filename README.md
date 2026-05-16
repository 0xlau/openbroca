# OpenBroca

OpenBroca is an open-source desktop voice assistant for turning speech into useful text, actions, and workflows across your computer. It is built as an Electron app with a provider-first architecture, so transcription, LLM completion, local models, and cloud services can evolve without locking the app to one vendor.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-39-47848f.svg)](https://www.electronjs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange.svg)](https://pnpm.io/)

## Why OpenBroca

- Speak naturally, then let the app transcribe, clean up, and deliver text where you need it.
- Use local or cloud ASR providers through one shared provider contract.
- Connect LLM providers through a registry that supports model selection, provider settings, and middleware.
- Keep sensitive provider credentials in OS-backed secure storage.
- Build desktop-first workflows with Electron, React, tRPC over IPC, and a typed monorepo.

## Status

OpenBroca is early software. The codebase is active, usable for development, and not yet at a polished public release. Expect APIs, provider contracts, and desktop UX details to keep moving while the project finds its shape.

## Repository Layout

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
  ROADMAP.md            Current direction
  PRIVACY.md            Data and credential handling notes
```

## Prerequisites

- Node.js 22 or newer
- pnpm 10.32.1 or newer
- macOS, Windows, or Linux for development
- Platform toolchains required by native Electron dependencies such as `keytar`, `uiohook-napi`, and `audify`

Install dependencies:

```bash
pnpm install
```

Start the desktop app:

```bash
pnpm dev
```

Run the main quality checks:

```bash
pnpm check
```

Run the test suite:

```bash
pnpm test
```

Build the app:

```bash
pnpm build
```

Create desktop bundles:

```bash
pnpm bundle:mac
pnpm bundle:win
pnpm bundle:linux
```

## Development

Common root commands:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

Target a package:

```bash
pnpm --filter openbroca-desktop dev
pnpm --filter @openbroca/providers test
pnpm --filter @openbroca/ui typecheck
```

The desktop app uses Electron's main, preload, and renderer processes under `apps/desktop/src`. Renderer-to-main communication goes through tRPC over a custom IPC transport rather than HTTP.

## Provider Platform

Provider implementations live in `packages/providers` and are consumed directly as TypeScript source by the desktop app.

- LLM providers implement `LLMProvider` and register descriptors with `LLMProviderRegistry`.
- ASR providers implement `ASRProvider`, `StreamingASRProvider`, or `LocalASRProvider`.
- Provider configuration uses a minimal `ConfigSchema<T>` interface so Zod or any compatible parser can be used.
- LLM middleware can wrap provider completion for cross-cutting behavior.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system map.

## Security And Secrets

Do not commit API keys, model provider credentials, local `.env` files, desktop build artifacts, or agent-local state. The repository is configured to ignore common local and secret-bearing files.

Before opening a PR, run:

```bash
trufflehog git file://$(pwd) --no-update
trufflehog filesystem . --no-update --force-skip-binaries --force-skip-archives
```

If you discover a vulnerability, follow [SECURITY.md](SECURITY.md).

## Releases

Release builds are tag-driven through GitHub Actions. See [docs/RELEASING.md](docs/RELEASING.md) for the checklist and artifact flow.

## Contributing

Contributions are welcome, especially provider integrations, cross-platform desktop reliability, accessibility improvements, and focused tests. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening issues or pull requests.

## License

OpenBroca is released under the [MIT License](LICENSE).
