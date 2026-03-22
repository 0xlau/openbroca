import { LLMProviderRegistry } from '@openbroca/core/llm'
import { ASRProviderRegistry } from '@openbroca/core/asr'
import { openaiDescriptor } from '@openbroca/providers/openai'
import { deepgramDescriptor } from '@openbroca/providers/deepgram'
import { sherpaOnnxDescriptor } from '@openbroca/providers/sherpa-onnx'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

llmRegistry.register(openaiDescriptor)
asrRegistry.register(deepgramDescriptor)
asrRegistry.register(sherpaOnnxDescriptor)
