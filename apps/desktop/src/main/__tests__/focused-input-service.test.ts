import type { AppIdentity, RawAppIdentity } from '@openbroca/app-identity'
import { describe, expect, test, vi } from 'vitest'
import { FocusedInputAppService } from '../focused-input/service'

describe('FocusedInputAppService', () => {
  test('returns the focused editable app when platform resolution succeeds', async () => {
    const rawFocusedApp: RawAppIdentity = {
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected'
    }
    const hydratedFocusedApp: AppIdentity = {
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi.fn<() => Promise<RawAppIdentity | null>>().mockResolvedValue(rawFocusedApp)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(hydratedFocusedApp)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(hydratedFocusedApp)

    expect(resolveFocusedInputApp).toHaveBeenCalledTimes(1)
    expect(hydrateApp).toHaveBeenCalledWith({
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected'
    })
    expect(getFrontmostApp).not.toHaveBeenCalled()
  })

  test('falls back to frontmost app when focused-input resolution returns null', async () => {
    const frontmostApp: AppIdentity = {
      id: 'com.google.Chrome',
      displayName: 'Google Chrome',
      platform: 'macos',
      bundleId: 'com.google.Chrome',
      path: '/Applications/Google Chrome.app',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi.fn<() => Promise<RawAppIdentity | null>>().mockResolvedValue(null)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostApp)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmostApp)

    expect(hydrateApp).not.toHaveBeenCalled()
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('falls back to frontmost app when focused-input resolution throws', async () => {
    const frontmostApp: AppIdentity = {
      id: 'Code.exe',
      displayName: 'Visual Studio Code',
      platform: 'windows',
      path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi
      .fn<() => Promise<RawAppIdentity | null>>()
      .mockRejectedValue(new Error('access denied'))
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostApp)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmostApp)

    expect(hydrateApp).not.toHaveBeenCalled()
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('falls back to frontmost app when hydration throws', async () => {
    const rawFocusedApp: RawAppIdentity = {
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      path: '/Applications/Cursor.app',
      source: 'detected'
    }
    const frontmostApp: AppIdentity = {
      id: 'com.google.Chrome',
      displayName: 'Google Chrome',
      platform: 'macos',
      bundleId: 'com.google.Chrome',
      path: '/Applications/Google Chrome.app',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi.fn<() => Promise<RawAppIdentity | null>>().mockResolvedValue(rawFocusedApp)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockRejectedValue(new Error('hydrate failed'))
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostApp)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmostApp)

    expect(hydrateApp).toHaveBeenCalledTimes(1)
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('falls back to frontmost app when normalization throws', async () => {
    const rawFocusedApp: RawAppIdentity = {
      displayName: 'Unknown App',
      platform: 'windows',
      source: 'detected'
    }
    const frontmostApp: AppIdentity = {
      id: 'com.google.Chrome',
      displayName: 'Google Chrome',
      platform: 'macos',
      bundleId: 'com.google.Chrome',
      path: '/Applications/Google Chrome.app',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi.fn<() => Promise<RawAppIdentity | null>>().mockResolvedValue(rawFocusedApp)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostApp)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmostApp)

    expect(hydrateApp).not.toHaveBeenCalled()
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('returns null when both focused-input and frontmost app fail', async () => {
    const resolveFocusedInputApp = vi.fn<() => Promise<RawAppIdentity | null>>().mockResolvedValue(null)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toBeNull()

    expect(hydrateApp).not.toHaveBeenCalled()
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('returns null when getFrontmostApp throws', async () => {
    const resolveFocusedInputApp = vi.fn<() => Promise<RawAppIdentity | null>>().mockResolvedValue(null)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockRejectedValue(new Error('frontmost failed'))
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toBeNull()

    expect(hydrateApp).not.toHaveBeenCalled()
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })
})
