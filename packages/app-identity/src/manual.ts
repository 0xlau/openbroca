import type { AppIdentity } from './contracts'

export function normalizeManualAppIdentity(input: {
  displayName: string
  platform: 'macos' | 'windows'
  stableId: string
  bundleId?: string
  aumid?: string
  path?: string
}): AppIdentity {
  const id = input.stableId.trim()
  if (!id) {
    throw new Error('Manual app entry requires a stable id')
  }

  return {
    id,
    displayName: input.displayName.trim() || id,
    platform: input.platform,
    bundleId: input.bundleId?.trim() || undefined,
    aumid: input.aumid?.trim() || undefined,
    path: input.path?.trim() || undefined,
    source: 'manual'
  }
}
