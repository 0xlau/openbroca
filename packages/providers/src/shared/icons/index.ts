/// <reference path="../assets.d.ts" />
import { getLobeIconCDN } from '@lobehub/icons/es/features/getLobeIconCDN/index.js'
import toc from '@lobehub/icons/es/toc.js'
import deepgram from '../../asr/providers/deepgram/icon.svg?raw'
import sherpaOnnx from '../../asr/providers/sherpa-onnx/icon.svg?raw'
import openaiWhisper from './openai-whisper.svg?raw'

type LobeVariant = 'color' | 'mono'

const lobeSvgIcon = (id: string) => {
  const icon = toc.find((entry) => entry.id === id)
  const type: LobeVariant = icon?.param.hasColor ? 'color' : 'mono'

  return getLobeIconCDN(id, {
    cdn: 'unpkg',
    format: 'svg',
    type
  })
}

export const providerIcons: Record<string, string> = {
  openai: lobeSvgIcon('OpenAI'),
  'openai-compatible': lobeSvgIcon('LlmApi'),
  openrouter: lobeSvgIcon('OpenRouter'),
  deepgram,
  'sherpa-onnx': sherpaOnnx,
  anthropic: lobeSvgIcon('Anthropic'),
  'azure-speech': lobeSvgIcon('AzureAI'),
  deepseek: lobeSvgIcon('DeepSeek'),
  fireworks: lobeSvgIcon('Fireworks'),
  'google-gemini': lobeSvgIcon('Gemini'),
  'google-speech': lobeSvgIcon('Google'),
  groq: lobeSvgIcon('Groq'),
  kimi: lobeSvgIcon('Moonshot'),
  'lm-studio': lobeSvgIcon('LmStudio'),
  mistral: lobeSvgIcon('Mistral'),
  ollama: lobeSvgIcon('Ollama'),
  'openai-whisper': openaiWhisper,
  perplexity: lobeSvgIcon('Perplexity'),
  qwen: lobeSvgIcon('Qwen'),
  together: lobeSvgIcon('Together'),
  xai: lobeSvgIcon('XAI'),
  zhipu: lobeSvgIcon('Zhipu'),
}
