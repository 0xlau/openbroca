# Contributing

Thanks for helping make OpenBroca better. This project aims to be useful, understandable, and welcoming without becoming loose about quality.

## Before You Start

- Search existing issues and pull requests first.
- Keep changes focused. A small, well-tested PR is easier to review than a broad rewrite.
- Discuss large architecture changes before implementing them.
- Never include API keys, tokens, private model files, generated desktop bundles, or personal agent/tooling state.

## Development Setup

```bash
pnpm install
pnpm dev
```

Run checks before opening a PR:

```bash
pnpm check
```

Run the test suite when touching behavior:

```bash
pnpm test
```

Useful package-level commands:

```bash
pnpm --filter openbroca-desktop typecheck
pnpm --filter openbroca-desktop test
pnpm --filter @openbroca/providers test
pnpm --filter @openbroca/ui typecheck
```

## Pull Request Guidelines

- Explain the user-facing or developer-facing problem.
- Include tests for behavior changes.
- Update docs when changing setup, architecture, provider contracts, or public workflows.
- Keep formatting changes separate from behavioral changes when practical.
- Include screenshots or short recordings for visible UI changes.

## Commit Style

Use Conventional Commits:

```text
feat: add provider health checks
fix: prevent duplicate shortcut registration
docs: document provider registry flow
test: cover persisted store hydration
```

## Code Style

- Follow the existing TypeScript and React patterns.
- Prefer tRPC procedures for renderer-to-main communication.
- Keep Electron main-process side effects isolated and testable.
- Use shared package contracts rather than duplicating provider or store types.
- Add abstractions only when they remove real duplication or clarify a boundary.

## Security Hygiene

Run a local secret scan before publishing a branch:

```bash
trufflehog git file://$(pwd) --no-update
```

If a real secret was committed, rotate it immediately and rewrite history before publishing.
