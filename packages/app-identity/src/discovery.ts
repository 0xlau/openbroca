import type { AppIdentity, AppPlatform, RawAppIdentity } from './contracts'
import { dedupeAppIdentities, normalizeDetectedAppIdentity } from './normalize'

type DiscoveryOptions = {
  platform: AppPlatform
  listDetectedApps: () => Promise<RawAppIdentity[]>
  getDetectedFrontmostApp: () => Promise<RawAppIdentity | null>
}

export function createDiscoveryClient(options: DiscoveryOptions) {
  return {
    async listApps(): Promise<AppIdentity[]> {
      const raw = await options.listDetectedApps()
      return dedupeAppIdentities(raw.map(normalizeDetectedAppIdentity)).sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
      )
    },
    async getFrontmostApp(): Promise<AppIdentity | null> {
      const raw = await options.getDetectedFrontmostApp()
      return raw ? normalizeDetectedAppIdentity(raw) : null
    }
  }
}
