import type { ASRProviderRegistry } from '@openbroca/providers/asr'
import type { LLMProviderRegistry } from '@openbroca/providers/llm'
import { deepseekDescriptor } from '@openbroca/providers/llm/deepseek'
import { fireworksDescriptor } from '@openbroca/providers/llm/fireworks'
import { geminiDescriptor } from '@openbroca/providers/llm/gemini'
import { groqDescriptor } from '@openbroca/providers/llm/groq'
import { kimiDescriptor } from '@openbroca/providers/llm/kimi'
import { lmStudioDescriptor } from '@openbroca/providers/llm/lm-studio'
import { mistralDescriptor } from '@openbroca/providers/llm/mistral'
import { ollamaDescriptor } from '@openbroca/providers/llm/ollama'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { openaiCompatibleDescriptor } from '@openbroca/providers/llm/openai-compatible'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { perplexityDescriptor } from '@openbroca/providers/llm/perplexity'
import { qwenDescriptor } from '@openbroca/providers/llm/qwen'
import { togetherDescriptor } from '@openbroca/providers/llm/together'
import { xaiDescriptor } from '@openbroca/providers/llm/xai'
import { zhipuDescriptor } from '@openbroca/providers/llm/zhipu'
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
  registry.register(openaiCompatibleDescriptor)
  registry.register(openrouterDescriptor)
  registry.register(geminiDescriptor)
  registry.register(deepseekDescriptor)
  registry.register(xaiDescriptor)
  registry.register(mistralDescriptor)
  registry.register(qwenDescriptor)
  registry.register(kimiDescriptor)
  registry.register(zhipuDescriptor)
  registry.register(groqDescriptor)
  registry.register(togetherDescriptor)
  registry.register(fireworksDescriptor)
  registry.register(perplexityDescriptor)
  registry.register(ollamaDescriptor)
  registry.register(lmStudioDescriptor)
}

export function registerAllASR(
  registry: ASRProviderRegistry,
  opts: ProviderSetupOptions
): void {
  registry.register(deepgramDescriptor)
  registry.register(createSherpaOnnxDescriptor({ defaultModelDir: opts.defaultModelDir }))
}
