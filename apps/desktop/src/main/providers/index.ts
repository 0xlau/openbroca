import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { openaiDescriptor } from '@openbroca/providers/llm/openai'
import { deepgramDescriptor } from '@openbroca/providers/asr/deepgram'
import { sherpaOnnxDescriptor } from '@openbroca/providers/asr/sherpa-onnx'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

llmRegistry.register(openaiDescriptor)
asrRegistry.register(deepgramDescriptor)
asrRegistry.register(sherpaOnnxDescriptor)
