function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface DictionaryEntry {
  id: string
  term: string
  type?: 'hotword' | 'replacement'
  replacement?: string
  note?: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface DictionarySettings {
  entries: DictionaryEntry[]
}

export const defaultDictionarySettings: DictionarySettings = {
  entries: []
}

export function normalizeDictionarySettings(raw: unknown): DictionarySettings {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    return defaultDictionarySettings
  }

  const entries = raw.entries.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return []
    }

    const term = typeof candidate.term === 'string' ? candidate.term.trim() : ''
    if (!term) {
      return []
    }

    const replacement =
      typeof candidate.replacement === 'string' ? candidate.replacement.trim() : undefined
    const type =
      candidate.type === 'hotword' || candidate.type === 'replacement' ? candidate.type : undefined

    return [
      {
        id: typeof candidate.id === 'string' ? candidate.id : '',
        term,
        type,
        replacement: replacement || undefined,
        note: typeof candidate.note === 'string' ? candidate.note.trim() || undefined : undefined,
        usageCount: typeof candidate.usageCount === 'number' ? candidate.usageCount : 0,
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : ''
      }
    ]
  })

  return { entries }
}
