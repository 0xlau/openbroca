export type AppPlatform = 'macos' | 'windows'
export type AppIdentitySource = 'detected' | 'manual'

export type AppIdentity = {
  id: string
  displayName: string
  platform: AppPlatform
  bundleId?: string
  aumid?: string
  path?: string
  iconDataUrl?: string
  source: AppIdentitySource
}

export type RawAppIdentity = Omit<AppIdentity, 'id'> & { id?: string }
