import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { openaiCodexDescriptor } from '@openbroca/providers/llm/openai-codex'
import { openrouterDescriptor } from '@openbroca/providers/llm/openrouter'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { sherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

llmRegistry.register(openaiDescriptor)
llmRegistry.register(openaiCodexDescriptor)
llmRegistry.register(openrouterDescriptor)
asrRegistry.register(deepgramDescriptor)
asrRegistry.register(sherpaOnnxDescriptor)
