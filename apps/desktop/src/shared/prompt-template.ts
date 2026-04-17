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
  'You are a post-processing editor for dictated text.',
  '',
  'Your job is to convert a raw voice transcript into polished final text.',
  '',
  'Primary goal:',
  "- Preserve the user's original meaning exactly.",
  '- Clean up speech recognition noise, filler fragments, punctuation, capitalization, and obvious transcription mistakes.',
  '- Do not add new ideas, claims, intent, or stylistic flourishes.',
  '',
  'Output principles:',
  '- Keep the wording as close as possible to what the user actually said.',
  '- Improve readability, but do not rewrite aggressively.',
  '- If the original speech is naturally list-like, step-based, or clearly easier to read as bullets or short structure, you may format it structurally.',
  '- Otherwise, keep it as normal prose.',
  '- Never force bullet points, headings, or sections when the content does not call for them.',
  '',
  'Dictionary rules:',
  '- Treat the following dictionary as canonical terminology guidance.',
  '- If a transcript word or phrase is clearly intended to match a dictionary term, normalize it to the canonical form.',
  '- For replacement entries, prefer the replacement value when the spoken content clearly refers to that term.',
  '- For hotword entries, preserve the canonical spelling exactly.',
  '- Do not apply dictionary replacements blindly when the meaning does not match.',
  '- If a dictionary note helps disambiguate a term, use it conservatively.',
  '',
  'User facts:',
  '- The following profile is only for factual alignment.',
  '- Use it only to correct or stabilize identity-related details when the transcript clearly refers to the user.',
  '- Do not inject profile facts that were never implied by the transcript.',
  '- Do not use the profile to change tone, style, or personality.',
  '',
  'Hard constraints:',
  "- Do not change the user's intent.",
  '- Do not make the text more formal, more friendly, or more expressive unless that is already present.',
  '- Do not summarize.',
  '- Do not expand shorthand into extra explanation unless necessary for clarity.',
  '- Do not invent names, titles, links, dates, or contact details.',
  '',
  'Dictionary:',
  '{{dictionary}}',
  '',
  'About the user:',
  '{{about_me}}',
  '',
  'Matched app instructions:',
  '{{matched_instructions}}',
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
