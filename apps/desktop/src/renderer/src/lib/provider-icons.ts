import openaiLogo from '@renderer/assets/ai/openai.svg'
import anthropicLogo from '@renderer/assets/ai/anthropic.svg'
import geminiLogo from '@renderer/assets/ai/gemini.svg'
import ollamaLogo from '@renderer/assets/ai/ollama.svg'
import azureaiLogo from '@renderer/assets/ai/azureai.svg'
import mistralLogo from '@renderer/assets/ai/mistral.svg'
import deepgramLogo from '@renderer/assets/ai/deepgram.svg'
import googleLogo from '@renderer/assets/ai/google.svg'
import k2fsaLogo from '@renderer/assets/ai/k2fsa.svg'

export const providerIconMap: Record<string, string> = {
  openai: openaiLogo,
  anthropic: anthropicLogo,
  'google-gemini': geminiLogo,
  ollama: ollamaLogo,
  'azure-speech': azureaiLogo,
  mistral: mistralLogo,
  deepgram: deepgramLogo,
  'google-speech': googleLogo,
  'openai-whisper': openaiLogo,
  'sherpa-onnx': k2fsaLogo
}
