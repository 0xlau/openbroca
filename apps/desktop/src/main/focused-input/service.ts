import type { AppIdentity, RawAppIdentity } from '@openbroca/app-identity'
import { normalizeDetectedAppIdentity } from '@openbroca/app-identity'

export type FocusedInputAppServiceDeps = {
  resolveFocusedInputApp: () => Promise<RawAppIdentity | null>
  hydrateApp: (app: AppIdentity | null) => Promise<AppIdentity | null>
  getFrontmostApp: () => Promise<AppIdentity | null>
}

export class FocusedInputAppService {
  constructor(private readonly deps: FocusedInputAppServiceDeps) {}

  async getFocusedInputApp(): Promise<AppIdentity | null> {
    try {
      const raw = await this.deps.resolveFocusedInputApp()
      if (raw) {
        const normalized = normalizeDetectedAppIdentity(raw)
        const hydrated = await this.deps.hydrateApp(normalized)
        if (hydrated) {
          return hydrated
        }
      }
    } catch (error) {
      console.debug('[voice-debug] focused input app resolution failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      return await this.deps.getFrontmostApp()
    } catch (error) {
      console.debug('[voice-debug] frontmost app resolution failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }
}
