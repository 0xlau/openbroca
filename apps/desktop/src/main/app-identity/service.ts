import type { AppIdentity } from '@openbroca/app-identity'

type ServiceDeps = {
  listApps: () => Promise<AppIdentity[]>
  getFrontmostApp: () => Promise<AppIdentity | null>
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

  async listApps(): Promise<AppIdentity[]> {
    const apps = await this.deps.listApps()
    return Promise.all(
      apps.map(async (item) => ({
        ...item,
        iconDataUrl: item.iconDataUrl ?? (await this.resolveIconDataUrl(item.path))
      }))
    )
  }

  async getFrontmostApp(): Promise<AppIdentity | null> {
    const item = await this.deps.getFrontmostApp()
    if (!item) return null

    return {
      ...item,
      iconDataUrl: item.iconDataUrl ?? (await this.resolveIconDataUrl(item.path))
    }
  }
}
