# Providers Package Consolidation Design

**Date:** 2026-03-25

## Goal

Merge `packages/core` into `packages/providers`, remove the standalone `@openbroca/core` package entirely, and reorganize `@openbroca/providers` around capability domains so the package structure matches how the code is actually used.

## Current State

The current split is:

- `packages/core`: shared errors, minimal schema types, LLM contracts, ASR contracts, and both registries
- `packages/providers`: concrete provider implementations, provider descriptors, and provider icon aggregation

This boundary is misleading. `packages/core` is not an independent product boundary; it exists only to support provider registration and provider implementations. The desktop app also consumes both packages together, which reinforces that they form one provider platform rather than two separate modules.

## Decision Summary

The repository will move to a single provider package:

- Delete `packages/core`
- Keep only `packages/providers`
- Reorganize `packages/providers/src` by domain:
  - `shared/`
  - `llm/`
  - `asr/`
- Make this a direct breaking change with no compatibility exports

This is intentionally a one-step migration. Any remaining `@openbroca/core` imports should fail fast until updated.

## Target Directory Structure

```text
packages/providers/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts
    shared/
      assets.d.ts
      errors.ts
      types.ts
      icons/
        index.ts
        anthropic.svg
        azureai.svg
        gemini.svg
        google.svg
        mistral.svg
        ollama.svg
        openai-whisper.svg
    llm/
      index.ts
      contracts.ts
      registry.ts
      __tests__/
        registry.test.ts
        middleware.test.ts
      providers/
        openai/
          index.ts
          provider.ts
          icon.svg
          __tests__/
            descriptor.test.ts
    asr/
      index.ts
      contracts.ts
      registry.ts
      __tests__/
        registry.test.ts
      providers/
        deepgram/
          index.ts
          provider.ts
          icon.svg
          __tests__/
            descriptor.test.ts
        sherpa-onnx/
          index.ts
          provider.ts
          icon.svg
          sherpa-onnx-node.d.ts
          __tests__/
            descriptor.test.ts
```

## Boundaries and Responsibilities

### `shared/`

Contains the smallest cross-domain foundation only:

- `errors.ts`: `ProviderError`, `ConfigurationError`, `TranscriptionError`
- `types.ts`: `ConfigSchema`, `Disposable`, `HealthCheckable`
- `assets.d.ts`: raw SVG asset typing shared by provider descriptors and icon aggregation
- `icons/`: non-provider-specific icon assets and the top-level icon map export

`shared/` must not accumulate registry logic or provider-specific contracts.

### `llm/`

Owns the LLM domain contract surface:

- `contracts.ts`: `LLMProvider`, `LLMProviderDescriptor`, request/result/message/model types, middleware types, `composeMiddleware`
- `registry.ts`: `LLMProviderRegistry`
- `providers/`: concrete LLM implementations such as OpenAI

### `asr/`

Owns the ASR domain contract surface:

- `contracts.ts`: `ASRProvider`, `CloudASRProvider`, `LocalASRProvider`, model-management types, transcription types
- `registry.ts`: `ASRProviderRegistry`
- `providers/`: concrete ASR implementations such as Deepgram and Sherpa-ONNX

## Public Export Contract

The package will expose these stable entry points:

- `@openbroca/providers`
- `@openbroca/providers/llm`
- `@openbroca/providers/asr`
- `@openbroca/providers/llm/openai`
- `@openbroca/providers/asr/deepgram`
- `@openbroca/providers/asr/sherpa-onnx`
- `@openbroca/providers/icons`

### Top-Level Export

`@openbroca/providers` exports only shared cross-domain primitives:

- `ProviderError`
- `ConfigurationError`
- `TranscriptionError`
- `ConfigSchema`
- `Disposable`
- `HealthCheckable`

### LLM Export

`@openbroca/providers/llm` exports:

- `LLMProviderRegistry`
- `LLMRegistryHooks`
- `LLMProvider`
- `LLMProviderDescriptor`
- `LLMMiddleware`
- `CompletionFn`
- `composeMiddleware`
- `ChatMessage`
- `CompletionRequest`
- `CompletionChunk`
- `CompletionResult`
- `TokenUsage`
- `LLMCapabilities`
- `LLMModel`

### ASR Export

`@openbroca/providers/asr` exports:

- `ASRProviderRegistry`
- `ASRRegistryHooks`
- `AnyASRProvider`
- `ASRProvider`
- `ASRProviderDescriptor`
- `CloudASRProvider`
- `LocalASRProvider`
- `LocalModelInfo`
- `DownloadProgress`
- `TranscriptionSegment`
- `TranscriptionOptions`

### Provider Entry Points

Each concrete provider entry point exports:

- `<provider>Descriptor`
- provider class
- provider config type

Examples:

- `@openbroca/providers/llm/openai`
- `@openbroca/providers/asr/deepgram`
- `@openbroca/providers/asr/sherpa-onnx`

## Breaking Import Migration

The migration intentionally removes the old package and old provider paths.

### Old to New Imports

| Old Import | New Import |
|---|---|
| `@openbroca/core` | `@openbroca/providers` |
| `@openbroca/core/llm` | `@openbroca/providers/llm` |
| `@openbroca/core/asr` | `@openbroca/providers/asr` |
| `@openbroca/providers/openai` | `@openbroca/providers/llm/openai` |
| `@openbroca/providers/deepgram` | `@openbroca/providers/asr/deepgram` |
| `@openbroca/providers/sherpa-onnx` | `@openbroca/providers/asr/sherpa-onnx` |

No aliases, deprecated re-exports, or fallback compatibility shims will be added.

## Affected Files

This change must update every affected file in the same branch. The implementation should not stop at moving source files; all consumers, docs, package manifests, and workspace references must be updated together.

### Delete

- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/vitest.config.ts`
- `packages/core/src/index.ts`
- `packages/core/src/types.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/__tests__/errors.test.ts`
- `packages/core/src/llm/index.ts`
- `packages/core/src/llm/types.ts`
- `packages/core/src/llm/registry.ts`
- `packages/core/src/llm/__tests__/registry.test.ts`
- `packages/core/src/llm/__tests__/middleware.test.ts`
- `packages/core/src/asr/index.ts`
- `packages/core/src/asr/types.ts`
- `packages/core/src/asr/registry.ts`
- `packages/core/src/asr/__tests__/registry.test.ts`

### Move or Replace Inside `packages/providers`

- `packages/providers/package.json`
- `packages/providers/tsconfig.json`
- `packages/providers/src/index.ts`
- `packages/providers/src/assets.d.ts`
- `packages/providers/src/icons/index.ts`
- `packages/providers/src/icons/anthropic.svg`
- `packages/providers/src/icons/azureai.svg`
- `packages/providers/src/icons/gemini.svg`
- `packages/providers/src/icons/google.svg`
- `packages/providers/src/icons/mistral.svg`
- `packages/providers/src/icons/ollama.svg`
- `packages/providers/src/icons/openai-whisper.svg`
- `packages/providers/src/openai/index.ts`
- `packages/providers/src/openai/provider.ts`
- `packages/providers/src/openai/icon.svg`
- `packages/providers/src/openai/__tests__/descriptor.test.ts`
- `packages/providers/src/deepgram/index.ts`
- `packages/providers/src/deepgram/provider.ts`
- `packages/providers/src/deepgram/icon.svg`
- `packages/providers/src/deepgram/__tests__/descriptor.test.ts`
- `packages/providers/src/sherpa-onnx/index.ts`
- `packages/providers/src/sherpa-onnx/provider.ts`
- `packages/providers/src/sherpa-onnx/icon.svg`
- `packages/providers/src/sherpa-onnx/sherpa-onnx-node.d.ts`
- `packages/providers/src/sherpa-onnx/__tests__/descriptor.test.ts`

### Update Repository Consumers and Tooling

- `apps/desktop/package.json`
- `apps/desktop/electron.vite.config.ts`
- `apps/desktop/src/main/providers/index.ts`
- `apps/desktop/src/main/trpc/context.ts`
- `vitest.workspace.ts`
- `CLAUDE.md`
- `pnpm-lock.yaml`

### New Files Expected

- `packages/providers/src/shared/errors.ts`
- `packages/providers/src/shared/types.ts`
- `packages/providers/src/shared/assets.d.ts`
- `packages/providers/src/shared/__tests__/errors.test.ts`
- `packages/providers/src/shared/icons/index.ts`
- `packages/providers/src/llm/index.ts`
- `packages/providers/src/llm/contracts.ts`
- `packages/providers/src/llm/registry.ts`
- `packages/providers/src/llm/__tests__/registry.test.ts`
- `packages/providers/src/llm/__tests__/middleware.test.ts`
- `packages/providers/src/llm/providers/openai/index.ts`
- `packages/providers/src/llm/providers/openai/provider.ts`
- `packages/providers/src/llm/providers/openai/icon.svg`
- `packages/providers/src/llm/providers/openai/__tests__/descriptor.test.ts`
- `packages/providers/src/asr/index.ts`
- `packages/providers/src/asr/contracts.ts`
- `packages/providers/src/asr/registry.ts`
- `packages/providers/src/asr/__tests__/registry.test.ts`
- `packages/providers/src/asr/providers/deepgram/index.ts`
- `packages/providers/src/asr/providers/deepgram/provider.ts`
- `packages/providers/src/asr/providers/deepgram/icon.svg`
- `packages/providers/src/asr/providers/deepgram/__tests__/descriptor.test.ts`
- `packages/providers/src/asr/providers/sherpa-onnx/index.ts`
- `packages/providers/src/asr/providers/sherpa-onnx/provider.ts`
- `packages/providers/src/asr/providers/sherpa-onnx/icon.svg`
- `packages/providers/src/asr/providers/sherpa-onnx/sherpa-onnx-node.d.ts`
- `packages/providers/src/asr/providers/sherpa-onnx/__tests__/descriptor.test.ts`

## Implementation Rules

### Preserve Runtime Behavior

This refactor is structural. It should not intentionally change:

- provider configuration schemas
- provider IDs
- registry behavior
- streaming behavior
- ASR model-management behavior
- icon contents

The only intended behavior changes are the package and subpath imports.

### Prefer Moves Over Rewrites

Existing logic should be moved into the new domain layout with the smallest behavior delta possible. Avoid opportunistic refactors unrelated to package consolidation.

### Use Relative Imports Internally

Code inside `packages/providers` should import other files in the same package via relative paths, not through the package's own public subpath exports.

Examples:

- use `../../contracts.ts`
- use `../../shared/errors.ts`
- do not use `@openbroca/providers/llm`
- do not use `@openbroca/providers`

This keeps package-internal boundaries explicit and avoids creating self-referential public-import coupling inside the package.

### Keep Descriptor Pattern Intact

Each concrete provider still uses a single exported descriptor object as the registration artifact. The move to domain-based paths must not change that contributor workflow.

## Testing and Verification

Implementation must verify both package-internal correctness and consumer integration.

### Package-Level Verification

- `pnpm --filter @openbroca/providers typecheck`
- `pnpm --filter @openbroca/providers test`

### Consumer Verification

- `pnpm --filter desktop typecheck`

### Workspace Verification

- `pnpm install`
- `pnpm test`

`pnpm install` is required because package removal and dependency changes must update `pnpm-lock.yaml` and workspace linking.

## Risks and Controls

### Risk: Missing a Consumer Import

Because this is a hard breaking change, any missed `@openbroca/core` or old provider-path import will surface as a typecheck or build failure.

Control:

- search the full repository for `@openbroca/core`
- search the full repository for `@openbroca/providers/openai`, `@openbroca/providers/deepgram`, and `@openbroca/providers/sherpa-onnx`
- run package and desktop typechecks after the move

### Risk: Incomplete Workspace Cleanup

Deleting `packages/core` without updating manifests, docs, or workspace test config leaves the repo inconsistent.

Control:

- update `apps/desktop/package.json`
- update `apps/desktop/electron.vite.config.ts`
- update `vitest.workspace.ts`
- update `CLAUDE.md`
- update `pnpm-lock.yaml`

### Risk: Structure Drift Inside `providers`

If some files stay in the old top-level layout while others move into `llm/` and `asr/`, the new package remains inconsistent.

Control:

- move every provider under `llm/providers/` or `asr/providers/`
- move all shared primitives under `shared/`
- do not leave legacy top-level `src/openai`, `src/deepgram`, `src/sherpa-onnx`, or `src/icons`

## Non-Goals

- No compatibility layer for `@openbroca/core`
- No new providers
- No provider feature expansion
- No registry redesign beyond path and file relocation
- No unrelated desktop-side refactor outside import and dependency updates required by this package consolidation
