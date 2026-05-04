import type { ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProviderRegistry } from '@openbroca/providers/llm'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { createSherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'

export interface ProviderSetupOptions {
  defaultModelDir: string
}

// Single source of truth for which descriptors ship with the app.
// Both the main-process registries (used for UI metadata, schema validation,
// setup status) and the utility-process registries (used for actual provider
// execution) call the same registration functions, so adding a new provider
// only requires editing this file.

export function registerAllLLM(registry: LLMProviderRegistry): void {
  registry.register(openaiDescriptor)
  registry.register(openrouterDescriptor)
}

export function registerAllASR(
  registry: ASRProviderRegistry,
  opts: ProviderSetupOptions
): void {
  registry.register(deepgramDescriptor)
  registry.register(createSherpaOnnxDescriptor({ defaultModelDir: opts.defaultModelDir }))
}
