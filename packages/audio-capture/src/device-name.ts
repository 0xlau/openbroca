const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

function stripDeviceNameNoise(name: string): string {
  return name.replace(/\0+/g, '').trim()
}

function decodeLatin1Mojibake(name: string): string | null {
  const bytes = Uint8Array.from(Array.from(name, (char) => char.charCodeAt(0) & 0xff))

  try {
    return utf8Decoder.decode(bytes)
  } catch {
    return null
  }
}

function hasCjk(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)
}

function countReplacementChars(text: string): number {
  return Array.from(text).filter((char) => char === '\ufffd').length
}

function countLatinSupplementRuns(text: string): number {
  return (text.match(/[\u00c0-\u00ff]{2,}/g) ?? []).length
}

function shouldUseDecodedName(original: string, decoded: string): boolean {
  if (decoded === original) return false
  if (decoded.length === 0) return false

  const originalReplacementChars = countReplacementChars(original)
  const decodedReplacementChars = countReplacementChars(decoded)

  if (decodedReplacementChars > originalReplacementChars) return false
  if (decodedReplacementChars < originalReplacementChars) return true
  if (hasCjk(decoded) && !hasCjk(original)) return true

  return countLatinSupplementRuns(decoded) < countLatinSupplementRuns(original)
}

export function normalizeAudioDeviceName(name: string): string {
  const cleaned = stripDeviceNameNoise(name)
  if (cleaned.length === 0) return cleaned

  const decoded = decodeLatin1Mojibake(cleaned)
  if (decoded && shouldUseDecodedName(cleaned, decoded)) {
    return stripDeviceNameNoise(decoded)
  }

  return cleaned
}
