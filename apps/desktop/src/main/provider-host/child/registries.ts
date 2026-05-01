import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { registerAllASR, registerAllLLM, type ProviderSetupOptions } from '../../providers/setup'

export interface ChildRegistries {
  asr: ASRProviderRegistry
  llm: LLMProviderRegistry
}

export function createChildRegistries(opts: ProviderSetupOptions): ChildRegistries {
  const llm = new LLMProviderRegistry()
  registerAllLLM(llm)
  const asr = new ASRProviderRegistry()
  registerAllASR(asr, opts)
  return { asr, llm }
}
