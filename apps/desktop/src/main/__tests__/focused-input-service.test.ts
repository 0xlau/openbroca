import type { AppIdentity, RawAppIdentity } from '@openbroca/app-identity'
import { describe, expect, test, vi } from 'vitest'
import { FocusedInputAppService } from '../focused-input/service'

describe('FocusedInputAppService', () => {
  test('getStrictFocusedInputApp prefers focused-input resolution when available', async () => {
    const rawFocusedApp: RawAppIdentity = {
      displayName: 'Visual Studio Code',
      platform: 'windows',
      path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      source: 'detected'
    }
    const hydratedFocusedApp: AppIdentity = {
      id: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      displayName: 'Visual Studio Code',
      platform: 'windows',
      path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi
      .fn<() => Promise<RawAppIdentity | null>>()
      .mockResolvedValue(rawFocusedApp)
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(hydratedFocusedApp)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getStrictFocusedInputApp()).resolves.toEqual(hydratedFocusedApp)

    expect(resolveFocusedInputApp).toHaveBeenCalledTimes(1)
    expect(hydrateApp).toHaveBeenCalledWith({
      id: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      displayName: 'Visual Studio Code',
      platform: 'windows',
      path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      source: 'detected'
    })
    expect(getFrontmostApp).not.toHaveBeenCalled()
  })

  test('getStrictFocusedInputApp falls back to the current frontmost app when focused-input is unavailable', async () => {
    const frontmostApp: AppIdentity = {
      id: 'com.tencent.xinWeChat',
      displayName: 'WeChat',
      platform: 'macos',
      bundleId: 'com.tencent.xinWeChat',
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

    await expect(service.getStrictFocusedInputApp()).resolves.toEqual(frontmostApp)
    expect(resolveFocusedInputApp).toHaveBeenCalledTimes(1)
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('getFocusedInputApp proxies the current frontmost app when no focused-input resolver is configured', async () => {
    const frontmostApp: AppIdentity = {
      id: 'Code.exe',
      displayName: 'Visual Studio Code',
      platform: 'windows',
      path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      source: 'detected'
    }
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostApp)
    const service = new FocusedInputAppService({ getFrontmostApp })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmostApp)
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
  })

  test('getFocusedInputApp falls back to frontmost app when focused-input resolution throws', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const frontmostApp: AppIdentity = {
      id: 'Code.exe',
      displayName: 'Visual Studio Code',
      platform: 'windows',
      path: 'C:\\Users\\liupeiqiang\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      source: 'detected'
    }
    const resolveFocusedInputApp = vi
      .fn<() => Promise<RawAppIdentity | null>>()
      .mockRejectedValue(new Error('focused failed'))
    const hydrateApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostApp)
    const service = new FocusedInputAppService({
      resolveFocusedInputApp,
      hydrateApp,
      getFrontmostApp
    })

    await expect(service.getFocusedInputApp()).resolves.toEqual(frontmostApp)

    expect(resolveFocusedInputApp).toHaveBeenCalledTimes(1)
    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith('[voice-debug] focused input app resolution failed', {
      error: 'focused failed'
    })
    debugSpy.mockRestore()
  })

  test('returns null when getFrontmostApp throws', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockRejectedValue(new Error('frontmost failed'))
    const service = new FocusedInputAppService({ getFrontmostApp })

    await expect(service.getFocusedInputApp()).resolves.toBeNull()

    expect(getFrontmostApp).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith('[voice-debug] frontmost app resolution failed', {
      error: 'frontmost failed'
    })
    debugSpy.mockRestore()
  })
})
