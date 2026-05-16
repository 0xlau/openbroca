# Privacy

OpenBroca is a desktop-first application. The repository is designed so provider choices and credential handling stay explicit.

## Local Data

The app stores local settings and state through Electron main-process storage. Some features may store voice history metadata, provider configuration, onboarding state, prompts, dictionary entries, and personalization settings.

## Credentials

Provider API keys and OAuth tokens should be stored through secure OS-backed storage. They must not be committed to the repository, written to logs, or placed in examples.

## Audio

Audio may be processed locally or sent to a configured ASR provider depending on the user's selected provider. Provider integrations should make this boundary clear in UI and documentation.

## Logs

Logs should avoid raw audio, provider secrets, OAuth tokens, and full prompt payloads unless a user explicitly opts into diagnostic sharing.

## For Contributors

When adding features, document:

- What data is collected or stored.
- Whether data leaves the device.
- Which provider receives the data.
- How users can disable, delete, or rotate related data.
