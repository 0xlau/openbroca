function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export interface AboutMeSettings {
  nickname: string
  email: string
  occupation: string
  bio: string
}

export const defaultAboutMeSettings: AboutMeSettings = {
  nickname: '',
  email: '',
  occupation: '',
  bio: ''
}

export function normalizeAboutMeSettings(raw: unknown): AboutMeSettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  return {
    nickname: normalizeString(record.nickname),
    email: normalizeString(record.email),
    occupation: normalizeString(record.occupation),
    bio: normalizeString(record.bio)
  }
}
