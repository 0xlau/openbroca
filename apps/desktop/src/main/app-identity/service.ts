import type { AppIdentity } from '@openbroca/app-identity'

type ServiceDeps = {
  listApps: () => Promise<AppIdentity[]>
  getFrontmostApp: () => Promise<AppIdentity | null>
  resolveBundleIconDataUrl?: (path?: string) => Promise<string | undefined>
  resolveIconDataUrl: (path?: string) => Promise<string | undefined>
}

export class AppIdentityService {
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

    if (item.platform === 'macos') {
      const bundleIcon = await this.resolveBundleIconDataUrl(item.path)
      if (bundleIcon) {
        return bundleIcon
      }
    }

    return this.resolveIconDataUrl(item.path)
  }

  async listApps(): Promise<AppIdentity[]> {
    const apps = await this.deps.listApps()
    return Promise.all(
      apps.map(async (item) => ({
        ...item,
        iconDataUrl: await this.resolveAppIcon(item)
      }))
    )
  }

  async getFrontmostApp(): Promise<AppIdentity | null> {
    const item = await this.deps.getFrontmostApp()
    if (!item) return null

    return {
      ...item,
      iconDataUrl: await this.resolveAppIcon(item)
    }
  }
}
