import { describe, expect, it } from 'vitest'
import { providerIcons } from './index.ts'

describe('providerIcons', () => {
  it('uses an available LobeHub SVG variant for supported providers', () => {
    expect(providerIcons.openai).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg'
    )
    expect(providerIcons.openrouter).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openrouter.svg'
    )
    expect(providerIcons['openai-compatible']).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llmapi-color.svg'
    )
    expect(providerIcons.deepseek).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek-color.svg'
    )
    expect(providerIcons.groq).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/groq.svg'
    )
    expect(providerIcons.anthropic).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/anthropic.svg'
    )
    expect(providerIcons['azure-speech']).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azureai-color.svg'
    )
    expect(providerIcons['google-gemini']).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemini-color.svg'
    )
    expect(providerIcons['google-speech']).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/google-color.svg'
    )
    expect(providerIcons.mistral).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mistral-color.svg'
    )
    expect(providerIcons.ollama).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ollama.svg'
    )
    expect(providerIcons['lm-studio']).toBe(
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lmstudio.svg'
    )
  })

  it('keeps unsupported providers on bundled inline SVG assets', () => {
    expect(providerIcons.deepgram).toMatch(/^<svg\b/)
    expect(providerIcons['sherpa-onnx']).toMatch(/^<svg\b/)
    expect(providerIcons['openai-whisper']).toMatch(/^<svg\b/)
  })
})
