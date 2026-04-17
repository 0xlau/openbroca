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

export interface PromptTemplateDictionaryRuntimeContext {
  text?: string
  hotwords?: string
  replacements?: string
  notes?: string
}

export interface PromptTemplateAboutMeRuntimeContext {
  text?: string
  nickname?: string
  email?: string
  occupation?: string
  bio?: string
}

export interface PromptTemplateRuntimeContext {
  dictionary?: PromptTemplateDictionaryRuntimeContext | null
  aboutMe?: PromptTemplateAboutMeRuntimeContext | null
  matchedInstructionText?: string | null
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

function normalizeRuntimeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function tokenToPlaceholderName(token: string): string | null {
  const matched = token.match(/^{{\s*([A-Za-z0-9_.-]+)\s*}}$/)
  return matched?.[1] ?? null
}

const plannedPlaceholderNames = new Set(
  promptTemplatePlaceholders
    .filter((placeholder) => placeholder.availability === 'planned')
    .map((placeholder) => tokenToPlaceholderName(placeholder.token))
    .filter((token): token is string => token !== null)
)

function resolveImplementedPlaceholder(
  placeholder: string,
  context: PromptTemplateRuntimeContext
): string | undefined {
  switch (placeholder) {
    case 'dictionary':
      return normalizeRuntimeString(context.dictionary?.text)
    case 'dictionary.hotwords':
      return normalizeRuntimeString(context.dictionary?.hotwords)
    case 'dictionary.replacements':
      return normalizeRuntimeString(context.dictionary?.replacements)
    case 'dictionary.notes':
      return normalizeRuntimeString(context.dictionary?.notes)
    case 'about_me':
      return normalizeRuntimeString(context.aboutMe?.text)
    case 'about_me.nickname':
      return normalizeRuntimeString(context.aboutMe?.nickname)
    case 'about_me.email':
      return normalizeRuntimeString(context.aboutMe?.email)
    case 'about_me.occupation':
      return normalizeRuntimeString(context.aboutMe?.occupation)
    case 'about_me.bio':
      return normalizeRuntimeString(context.aboutMe?.bio)
    case 'matched_instructions':
    case 'matched_instructions.text':
      return normalizeRuntimeString(context.matchedInstructionText)
    default:
      return undefined
  }
}

export function resolvePromptTemplate(
  template: string,
  context: PromptTemplateRuntimeContext
): string {
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, placeholder: string) => {
    const implemented = resolveImplementedPlaceholder(placeholder, context)
    if (typeof implemented === 'string') {
      return implemented
    }

    if (plannedPlaceholderNames.has(placeholder)) {
      return ''
    }

    return ''
  })
}

export function normalizePromptTemplateSettings(raw: unknown): PromptTemplateSettings {
  if (!isRecord(raw)) {
    return { template: '' }
  }

  return {
    template: typeof raw.template === 'string' ? raw.template : ''
  }
}
