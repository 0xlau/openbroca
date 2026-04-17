import type { AppIdentity } from '@openbroca/app-identity'

type ServiceDeps = {
  listApps: () => Promise<AppIdentity[]>
  getFrontmostApp: () => Promise<AppIdentity | null>
  resolveBundleIconDataUrl?: (path?: string) => Promise<string | undefined>
  resolveIconDataUrl: (path?: string) => Promise<string | undefined>
}

function getAppIconCacheKey(item: AppIdentity): string | undefined {
  return item.path ?? item.bundleId ?? item.aumid ?? item.id
}

export class AppIdentityService {
  private readonly iconDataUrlCache = new Map<string, Promise<string | undefined>>()

  constructor(private readonly deps: ServiceDeps) {}

  private async resolveIconDataUrl(path?: string): Promise<string | undefined> {
    try {
      return await this.deps.resolveIconDataUrl(path)
    } catch {
      return undefined
    }
  }

  private async resolveBundleIconDataUrl(path?: string): Promise<string | undefined> {
    try {
      return await this.deps.resolveBundleIconDataUrl?.(path)
    } catch {
      return undefined
    }
  }

  private async resolveAppIcon(item: AppIdentity): Promise<string | undefined> {
    if (item.iconDataUrl) {
      return item.iconDataUrl
    }

    const cacheKey = getAppIconCacheKey(item)
    if (cacheKey) {
      const cached = this.iconDataUrlCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const pending = (async () => {
      if (item.platform === 'macos') {
        const bundleIcon = await this.resolveBundleIconDataUrl(item.path)
        if (bundleIcon) {
          return bundleIcon
        }
      }

      return this.resolveIconDataUrl(item.path)
    })()

    if (cacheKey) {
      this.iconDataUrlCache.set(cacheKey, pending)
    }

    const resolved = await pending

    if (!resolved && cacheKey) {
      this.iconDataUrlCache.delete(cacheKey)
    }

    return resolved
  }

  private async hydrateKnownApp(item: AppIdentity): Promise<AppIdentity> {
    return {
      ...item,
      iconDataUrl: await this.resolveAppIcon(item)
    }
  }

  async hydrateApp(item: AppIdentity | null): Promise<AppIdentity | null> {
    if (!item) {
      return null
    }

    return this.hydrateKnownApp(item)
  }

  async listApps(): Promise<AppIdentity[]> {
    const apps = await this.deps.listApps()
    return Promise.all(apps.map((item) => this.hydrateKnownApp(item)))
  }

  async getFrontmostApp(): Promise<AppIdentity | null> {
    return this.hydrateApp(await this.deps.getFrontmostApp())
  }
}
