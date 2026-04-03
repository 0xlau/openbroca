import { describe, expect, test, vi } from 'vitest'
import type { AppIdentity } from '@openbroca/app-identity'
import type { Context } from '../trpc/context'
import { appIdentityRouter } from '../trpc/routers/app-identity'

describe('appIdentityRouter', () => {
  test('listApps proxies AppIdentityService.listApps', async () => {
    const sampleApps: AppIdentity[] = [
      {
        id: 'com.example.app',
        displayName: 'Example App',
        platform: 'macos',
        path: '/Applications/Example.app',
        source: 'detected'
      }
    ]

    const listApps = vi.fn().mockResolvedValue(sampleApps)
    const getFrontmostApp = vi.fn()

    const caller = appIdentityRouter.createCaller({
      appIdentityService: {
        listApps,
        getFrontmostApp
      }
    } as unknown as Context)

    await expect(caller.listApps()).resolves.toEqual(sampleApps)
    expect(listApps).toHaveBeenCalled()
    expect(getFrontmostApp).not.toHaveBeenCalled()
  })

  test('frontmost proxies AppIdentityService.getFrontmostApp', async () => {
    const frontmost: AppIdentity = {
      id: 'com.example.front',
      displayName: 'Front App',
      platform: 'macos',
      path: '/Applications/Front.app',
      source: 'detected'
    }

    const listApps = vi.fn()
    const getFrontmostApp = vi.fn().mockResolvedValue(frontmost)

    const caller = appIdentityRouter.createCaller({
      appIdentityService: {
        listApps,
        getFrontmostApp
      }
    } as unknown as Context)

    await expect(caller.frontmost()).resolves.toEqual(frontmost)
    expect(getFrontmostApp).toHaveBeenCalled()
    expect(listApps).not.toHaveBeenCalled()
  })
})
