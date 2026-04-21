import type { AppIdentity, RawAppIdentity } from '@openbroca/app-identity'
import { normalizeDetectedAppIdentity } from '@openbroca/app-identity'

export type FocusedInputAppServiceDeps = {
  resolveFocusedInputApp?: () => Promise<RawAppIdentity | null>
  hydrateApp?: (app: AppIdentity | null) => Promise<AppIdentity | null>
  getFrontmostApp: () => Promise<AppIdentity | null>
}

export class FocusedInputAppService {
  constructor(private readonly deps: FocusedInputAppServiceDeps) {}

  private async resolveFocusedInputApp(): Promise<AppIdentity | null> {
    if (!this.deps.resolveFocusedInputApp) {
      return null
    }

    const rawApp = await this.deps.resolveFocusedInputApp()
    if (!rawApp) {
      return null
    }

    const normalizedApp = normalizeDetectedAppIdentity(rawApp)
    if (!this.deps.hydrateApp) {
      return normalizedApp
    }

    return this.deps.hydrateApp(normalizedApp)
  }

  async getStrictFocusedInputApp(): Promise<AppIdentity | null> {
    if (this.deps.resolveFocusedInputApp) {
      try {
        const focusedInputApp = await this.resolveFocusedInputApp()
        if (focusedInputApp) {
          return focusedInputApp
        }
      } catch (error) {
        console.debug('[voice-debug] focused input app resolution failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return this.deps.getFrontmostApp()
  }

  async getFocusedInputApp(): Promise<AppIdentity | null> {
    if (this.deps.resolveFocusedInputApp) {
      try {
        const focusedInputApp = await this.resolveFocusedInputApp()
        if (focusedInputApp) {
          return focusedInputApp
        }
      } catch (error) {
        console.debug('[voice-debug] focused input app resolution failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
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
