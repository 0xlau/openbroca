/// <reference path="../assets.d.ts" />
import openai from '../openai/icon.svg?raw'
import deepgram from '../deepgram/icon.svg?raw'
import sherpaOnnx from '../sherpa-onnx/icon.svg?raw'
import anthropic from './anthropic.svg?raw'
import azureai from './azureai.svg?raw'
import gemini from './gemini.svg?raw'
import google from './google.svg?raw'
import mistral from './mistral.svg?raw'
import ollama from './ollama.svg?raw'
import openaiWhisper from './openai-whisper.svg?raw'

export const providerIcons: Record<string, string> = {
  openai,
  deepgram,
  'sherpa-onnx': sherpaOnnx,
  anthropic,
  'azure-speech': azureai,
  'google-gemini': gemini,
  'google-speech': google,
  mistral,
  ollama,
  'openai-whisper': openaiWhisper,
}
