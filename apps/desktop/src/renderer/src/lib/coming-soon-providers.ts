export interface ComingSoonProvider {
  id: string
  displayName: string
  description: string
  type: 'llm' | 'asr'
  kind?: 'cloud' | 'local'
}

export const COMING_SOON_LLM: ComingSoonProvider[] = [
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude 3.5 / 4 series models via Anthropic API',
    type: 'llm'
  }
  // {
  //   id: 'google-gemini',
  //   displayName: 'Google Gemini',
  //   description: 'Gemini Pro and Flash models via Google AI Studio',
  //   type: 'llm'
  // },
  // {
  //   id: 'mistral',
  //   displayName: 'Mistral AI',
  //   description: 'Mistral and Mixtral models via La Plateforme',
  //   type: 'llm'
  // },
  // {
  //   id: 'ollama',
  //   displayName: 'Ollama',
  //   description: 'Run open-source models locally on your machine',
  //   type: 'llm'
  // }
]

export const COMING_SOON_ASR: ComingSoonProvider[] = [
  {
    id: 'openai-whisper',
    displayName: '@openai/whisper',
    description: 'High-accuracy speech recognition powered by OpenAI',
    type: 'asr',
    kind: 'local'
  }
  // {
  //   id: 'azure-speech',
  //   displayName: 'Azure Speech',
  //   description: 'Microsoft Azure Cognitive Services Speech-to-Text',
  //   type: 'asr',
  //   kind: 'cloud'
  // },
  // {
  //   id: 'google-speech',
  //   displayName: 'Google Speech',
  //   description: 'Google Cloud Speech-to-Text API',
  //   type: 'asr',
  //   kind: 'cloud'
  // }
]
