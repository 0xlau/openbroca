import type { AboutMeSettings } from '../shared/about-me'
import type { DictionaryEntry, DictionarySettings } from '../shared/dictionary'
import {
  defaultPromptTemplateText,
  resolvePromptTemplate,
  type PromptTemplateRuntimeContext
} from '../shared/prompt-template'

export interface CleanupPromptContext {
  dictionary: DictionarySettings
  aboutMe: AboutMeSettings
  matchedInstructionText?: string | null
  template?: string | null
}

function sanitizeForPromptLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
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

interface SerializedDictionary {
  text: string
  hotwords: string
  replacements: string
  notes: string
}

function serializeDictionary(settings: DictionarySettings): SerializedDictionary {
  const entries = [...settings.entries].sort(compareDictionaryEntries)
  const hotwords = entries.filter((entry) => isHotwordEntry(entry))
  const replacements = entries.filter((entry) => isReplacementEntry(entry))
  const includedEntries = [...hotwords, ...replacements]
  const notes = includedEntries.filter(
    (entry) => typeof entry.note === 'string' && sanitizeForPromptLine(entry.note).length > 0
  )
  const hotwordLines = hotwords.map((entry) => `- ${sanitizeForPromptLine(entry.term)}`)
  const replacementLines = replacements.map(
    (entry) => `- ${sanitizeForPromptLine(entry.term)} => ${sanitizeForPromptLine(entry.replacement)}`
  )
  const noteLines = notes.map(
    (entry) => `- ${sanitizeForPromptLine(entry.term)}: ${sanitizeForPromptLine(entry.note ?? '')}`
  )

  const lines: string[] = []

  if (hotwordLines.length > 0) {
    lines.push('hotword:', ...hotwordLines)
  }

  if (replacementLines.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }
    lines.push('replacement:', ...replacementLines)
  }

  if (noteLines.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }
    lines.push('notes:', ...noteLines)
  }

  return {
    text: renderNoneWhenEmpty(lines),
    hotwords: hotwordLines.join('\n'),
    replacements: replacementLines.join('\n'),
    notes: noteLines.join('\n')
  }
}

interface SerializedAboutMe {
  text: string
  nickname: string
  email: string
  occupation: string
  bio: string
}

function serializeAboutMe(settings: AboutMeSettings): SerializedAboutMe {
  const nickname = sanitizeForPromptLine(settings.nickname)
  const email = sanitizeForPromptLine(settings.email)
  const occupation = sanitizeForPromptLine(settings.occupation)
  const bio = sanitizeForPromptLine(settings.bio)

  const lines = [
    nickname ? `nickname: ${nickname}` : null,
    email ? `email: ${email}` : null,
    occupation ? `occupation: ${occupation}` : null,
    bio ? `bio: ${bio}` : null
  ].filter((line): line is string => line !== null)

  return {
    text: renderNoneWhenEmpty(lines),
    nickname,
    email,
    occupation,
    bio
  }
}

export function buildCleanupSystemPrompt(context: CleanupPromptContext): string {
  const dictionary = serializeDictionary(context.dictionary)
  const aboutMe = serializeAboutMe(context.aboutMe)
  const matchedInstructionText = sanitizeForPromptLine(context.matchedInstructionText ?? '')
  const runtimeContext: PromptTemplateRuntimeContext = {
    dictionary: {
      text: dictionary.text,
      hotwords: dictionary.hotwords,
      replacements: dictionary.replacements,
      notes: dictionary.notes
    },
    aboutMe: {
      text: aboutMe.text,
      nickname: aboutMe.nickname,
      email: aboutMe.email,
      occupation: aboutMe.occupation,
      bio: aboutMe.bio
    },
    matchedInstructionText
  }
  const template = typeof context.template === 'string' && context.template.trim().length > 0
    ? context.template
    : defaultPromptTemplateText

  return resolvePromptTemplate(template, runtimeContext)
}
