import type { AppIdentity, RawAppIdentity } from './contracts'

function normalizeText(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

export function normalizeDetectedAppIdentity(raw: RawAppIdentity): AppIdentity {
  const platform = raw.platform
  const bundleId = normalizeText(raw.bundleId)
  const aumid = normalizeText(raw.aumid)
  const path = normalizeText(raw.path)
  const displayName = normalizeText(raw.displayName) ?? 'Unknown App'
  const id =
    normalizeText(raw.id) ??
    (platform === 'macos' ? bundleId : undefined) ??
    (platform === 'windows' ? aumid : undefined) ??
    path

  if (!id) {
    throw new Error(`Unable to derive stable app id for ${displayName}`)
  }

  return {
    id,
    displayName,
    platform,
    bundleId,
    aumid,
    path,
    iconDataUrl: normalizeText(raw.iconDataUrl),
    source: raw.source
  }
}

export function dedupeAppIdentities(items: AppIdentity[]): AppIdentity[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
