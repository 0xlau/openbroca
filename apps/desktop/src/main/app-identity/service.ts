import type { AppIdentity } from '@openbroca/app-identity'

type ServiceDeps = {
  listApps: () => Promise<AppIdentity[]>
  getFrontmostApp: () => Promise<AppIdentity | null>
  resolveIconDataUrl: (path?: string) => Promise<string | undefined>
}

export class AppIdentityService {
  constructor(private readonly deps: ServiceDeps) {}

  async listApps(): Promise<AppIdentity[]> {
    const apps = await this.deps.listApps()
    return Promise.all(
      apps.map(async (item) => ({
        ...item,
        iconDataUrl: item.iconDataUrl ?? (await this.deps.resolveIconDataUrl(item.path))
      }))
    )
  }

  async getFrontmostApp(): Promise<AppIdentity | null> {
    const item = await this.deps.getFrontmostApp()
    if (!item) return null

    return {
      ...item,
      iconDataUrl: item.iconDataUrl ?? (await this.deps.resolveIconDataUrl(item.path))
    }
  }
}
