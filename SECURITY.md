# Security Policy

OpenBroca handles provider credentials, audio input, desktop permissions, and local application state. Please report security issues privately.

## Reporting A Vulnerability

If you believe you found a vulnerability, please email the maintainer listed in `apps/desktop/package.json` or use GitHub private vulnerability reporting once it is enabled for the repository.

Please include:

- A clear description of the issue.
- Steps to reproduce or a proof of concept.
- Affected platform and version.
- Impact assessment, including whether credentials, audio, local files, or desktop automation are involved.

Do not open a public issue for active vulnerabilities.

## Secrets

Never commit:

- Provider API keys or OAuth secrets.
- `.env` files.
- Desktop signing certificates or provisioning profiles.
- Local model credentials or private model artifacts.
- Agent-local state such as `.claude/`, `.agents/`, `.superpowers/`, or worktrees.

## Supported Versions

OpenBroca is pre-1.0. Security fixes target the current `main` branch until stable releases are published.
