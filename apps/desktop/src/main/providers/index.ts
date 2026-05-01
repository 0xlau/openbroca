import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { createSherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

llmRegistry.register(openaiDescriptor)
llmRegistry.register(openaiCodexDescriptor)
llmRegistry.register(openrouterDescriptor)
asrRegistry.register(deepgramDescriptor)

/**
 * Local ASR providers depend on platform-managed paths (e.g.
 * `app.getPath('userData')`) that are only available after Electron's `app`
 * module is initialized. Call this from main once `app.whenReady()` resolves.
 *
 * Kept as an explicit step rather than triggering on module import so unit
 * tests for unrelated runtime code don't have to mock Electron just to import
 * this file.
 */
export function registerLocalASRProviders(opts: { defaultModelDir: string }): void {
  asrRegistry.register(
    createSherpaOnnxDescriptor({ defaultModelDir: opts.defaultModelDir })
  )
}
