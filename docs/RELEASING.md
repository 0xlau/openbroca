# Releasing

OpenBroca releases are managed by [release-please](https://github.com/googleapis/release-please). The release workflow opens and updates a Release PR from Conventional Commits. When that PR is merged, release-please bumps versions, writes the changelog, creates the GitHub Release, and the same workflow builds desktop installers and uploads them to the release.

## Release Checklist

1. Use Conventional Commits for merged PRs, especially `feat:`, `fix:`, and breaking-change commits.
2. Make sure `main` is green:

   ```bash
   pnpm check
   pnpm --filter @openbroca/app-identity test
   pnpm --filter @openbroca/audio-capture test
   pnpm --filter @openbroca/providers test
   ```

3. Let the `Release` workflow open or update the release PR.
4. Review the generated changelog and version bump.
5. Merge the release PR when ready.
6. Watch the `Release` workflow build macOS/Windows installers and upload them to the generated GitHub Release.

## Versioning

Release Please reads `release-please-config.json` and `.release-please-manifest.json`.

- The repository is treated as one release unit.
- Tags use `v<version>` format, for example `v0.2.0`.
- The root `package.json` and `apps/desktop/package.json` versions are kept in sync.
- Release notes are generated from Conventional Commits.

## Workflow

The release workflow runs on pushes to `main` and can also be started manually.

It uses:

- `googleapis/release-please-action@v4` to manage Release PRs and GitHub Releases.
- `macos-26` for macOS arm64 installer builds.
- `macos-26-intel` for macOS x64 installer builds.
- `windows-latest` for Windows x64 installer builds.

If a release is created, the workflow checks out the release tag, builds installers, and uploads `.dmg`, `.exe`, and `.blockmap` assets to the GitHub Release.

## Token

The workflow uses `RELEASE_PLEASE_TOKEN` when present and falls back to `GITHUB_TOKEN`. A personal access token is recommended so release-please PRs and release-created events can trigger other workflows normally.

## Signing And Notarization

The repository currently builds unsigned macOS artifacts in CI so public forks can build release packages without private certificates. Before distributing production macOS builds broadly, wire Apple signing and notarization through GitHub Secrets and switch `electron-builder.yml` back to signed/notarized builds.
