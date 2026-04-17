import type { AboutMeSettings } from '../shared/about-me'
import type { DictionaryEntry, DictionarySettings } from '../shared/dictionary'

export interface CleanupPromptContext {
  dictionary: DictionarySettings
  aboutMe: AboutMeSettings
  matchedInstructionText?: string | null
}

function compareDictionaryEntries(left: DictionaryEntry, right: DictionaryEntry): number {
  if (right.usageCount !== left.usageCount) {
    return right.usageCount - left.usageCount
  }

  return right.updatedAt.localeCompare(left.updatedAt)
}

function hasReplacement(entry: DictionaryEntry): entry is DictionaryEntry & { replacement: string } {
  return typeof entry.replacement === 'string' && entry.replacement.trim().length > 0
}

function isReplacementEntry(entry: DictionaryEntry): entry is DictionaryEntry & { replacement: string } {
  if (entry.type === 'replacement') {
    return hasReplacement(entry)
  }

  if (entry.type === undefined) {
    return hasReplacement(entry)
  }

  return false
}

function isHotwordEntry(entry: DictionaryEntry): boolean {
  if (entry.type === 'hotword') {
    return true
  }

  if (entry.type === undefined) {
    return !hasReplacement(entry)
  }

  return false
}

function renderNoneWhenEmpty(lines: string[]): string {
  return lines.length > 0 ? lines.join('\n') : 'None.'
}

function serializeDictionary(settings: DictionarySettings): string {
  const entries = [...settings.entries].sort(compareDictionaryEntries)
  const hotwords = entries.filter((entry) => isHotwordEntry(entry))
  const replacements = entries.filter((entry) => isReplacementEntry(entry))
  const notes = entries.filter((entry) => typeof entry.note === 'string' && entry.note.trim().length > 0)

  const lines: string[] = []

  if (hotwords.length > 0) {
    lines.push('hotword:', ...hotwords.map((entry) => `- ${entry.term}`))
  }

  if (replacements.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }
    lines.push(
      'replacement:',
      ...replacements.map((entry) => `- ${entry.term} => ${entry.replacement}`)
    )
  }

  if (notes.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }
    lines.push('notes:', ...notes.map((entry) => `- ${entry.term}: ${entry.note}`))
  }

  return renderNoneWhenEmpty(lines)
}

function serializeAboutMe(settings: AboutMeSettings): string {
  const nickname = settings.nickname.trim()
  const email = settings.email.trim()
  const occupation = settings.occupation.trim()
  const bio = settings.bio.trim()

  const lines = [
    nickname ? `nickname: ${nickname}` : null,
    email ? `email: ${email}` : null,
    occupation ? `occupation: ${occupation}` : null,
    bio ? `bio: ${bio}` : null
  ].filter((line): line is string => line !== null)

  return renderNoneWhenEmpty(lines)
}

export function buildCleanupSystemPrompt(context: CleanupPromptContext): string {
  const matchedInstructionText = context.matchedInstructionText?.trim()

  return [
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
    '- Output only the final cleaned text, with no commentary.',
    '',
    'Dictionary:',
    serializeDictionary(context.dictionary),
    '',
    'About the user:',
    serializeAboutMe(context.aboutMe),
    ...(matchedInstructionText ? ['', 'Matched app instructions:', matchedInstructionText] : [])
  ].join('\n')
}
