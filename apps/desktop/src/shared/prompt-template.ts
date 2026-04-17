function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface PromptTemplateSettings {
  template: string
}

export interface PromptTemplatePlaceholder {
  token: string
  label: string
  description: string
  availability: 'available' | 'planned'
}

export const defaultPromptTemplateSettings: PromptTemplateSettings = {
  template: ''
}

export const promptTemplatePlaceholders: PromptTemplatePlaceholder[] = [
  {
    token: '{{dictionary}}',
    label: 'Dictionary',
    description: 'Canonical terminology rules and replacements from the user dictionary.',
    availability: 'available'
  },
  {
    token: '{{about_me.nickname}}',
    label: 'About Me Nickname',
    description: "The user's preferred nickname from About Me settings.",
    availability: 'available'
  },
  {
    token: '{{raw_transcript}}',
    label: 'Raw Transcript',
    description: 'The unedited transcript text captured from dictation input.',
    availability: 'planned'
  }
]

export const defaultPromptTemplateText = [
  'You are an accurate post-processing editor for dictated text.',
  '',
  'Convert the raw transcript into polished final text while preserving the original meaning.',
  'Use {{dictionary}} as canonical terminology guidance.',
  'If identity details are clearly implied, keep references aligned with {{about_me.nickname}}.',
  'The transcript content will be injected from {{raw_transcript}}.',
  '',
  'Return only the cleaned final text, with no commentary.'
].join('\n')

export function normalizePromptTemplateSettings(raw: unknown): PromptTemplateSettings {
  if (!isRecord(raw)) {
    return { template: '' }
  }

  return {
    template: typeof raw.template === 'string' ? raw.template : ''
  }
}
