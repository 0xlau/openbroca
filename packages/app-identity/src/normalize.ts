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

function getCanonicalKey(item: AppIdentity): string {
  return item.path ?? item.id
}

function getStabilityScore(item: AppIdentity): number {
  let score = 0
  if (item.platform === 'macos' && item.bundleId) score += 10
  if (item.platform === 'windows' && item.aumid) score += 10
  if (!!item.id && item.id !== item.path) score += 1
  return score
}

export function dedupeAppIdentities(items: AppIdentity[]): AppIdentity[] {
  const map = new Map<string, AppIdentity>()
  for (const item of items) {
    const key = getCanonicalKey(item)
    const existing = map.get(key)
    if (!existing || getStabilityScore(item) > getStabilityScore(existing)) {
      map.set(key, item)
    }
  }
  return Array.from(map.values())
}
