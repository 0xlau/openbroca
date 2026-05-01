import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { registerAllASR, registerAllLLM } from './setup'

export const llmRegistry = new LLMProviderRegistry()
export const asrRegistry = new ASRProviderRegistry()

registerAllLLM(llmRegistry)

/**
 * Local ASR providers depend on platform-managed paths (e.g.
 * `app.getPath('userData')`) that are only available after Electron's `app`
 * module is initialized. Call this from main once `app.whenReady()` resolves.
 *
 * Registration is intentionally split between eager (LLM) and lazy (ASR) so
 * unrelated unit tests can import this module without mocking Electron.
 */
export function registerLocalASRProviders(opts: { defaultModelDir: string }): void {
  registerAllASR(asrRegistry, opts)
}
