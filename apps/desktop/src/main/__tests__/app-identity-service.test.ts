import { describe, expect, test, vi } from 'vitest'
import { AppIdentityService } from '../app-identity/service'

describe('AppIdentityService', () => {
  test('hydrates icons onto discovered app identities', async () => {
    const service = new AppIdentityService({
      listApps: vi.fn().mockResolvedValue([
        {
          id: 'com.todesktop.230313mzl4w4u92',
          displayName: 'Cursor',
          platform: 'macos',
          path: '/Applications/Cursor.app',
          source: 'detected'
        }
      ]),
      getFrontmostApp: vi.fn().mockResolvedValue(null),
      resolveIconDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,abc')
    })

    await expect(service.listApps()).resolves.toEqual([
      expect.objectContaining({
        iconDataUrl: 'data:image/png;base64,abc'
      })
    ])
  })

  test('returns app identities even when icon resolution fails', async () => {
    const service = new AppIdentityService({
      listApps: vi.fn().mockResolvedValue([
        {
          id: 'cursor',
          displayName: 'Cursor',
          platform: 'macos',
          path: '/Applications/Cursor.app',
          source: 'detected'
        },
        {
          id: 'arc',
          displayName: 'Arc',
          platform: 'macos',
          path: '/Applications/Arc.app',
          source: 'detected'
        }
      ]),
      getFrontmostApp: vi.fn().mockResolvedValue({
        id: 'cursor',
        displayName: 'Cursor',
        platform: 'macos',
        path: '/Applications/Cursor.app',
        source: 'detected'
      }),
      resolveIconDataUrl: vi.fn(async (filePath?: string) => {
        if (filePath?.includes('Cursor.app')) {
          throw new Error('failed to read icon')
        }
        return 'data:image/png;base64,ok'
      })
    })

    await expect(service.listApps()).resolves.toEqual([
      expect.objectContaining({
        id: 'cursor',
        iconDataUrl: undefined
      }),
      expect.objectContaining({
        id: 'arc',
        iconDataUrl: 'data:image/png;base64,ok'
      })
    ])
    await expect(service.getFrontmostApp()).resolves.toEqual(
      expect.objectContaining({
        id: 'cursor',
        iconDataUrl: undefined
      })
    )
  })

  test('prefers bundle icon resolution for mac apps before generic file icons', async () => {
    const resolveBundleIconDataUrl = vi.fn().mockResolvedValue('data:image/png;base64,bundle')
    const resolveIconDataUrl = vi.fn().mockResolvedValue('data:image/png;base64,generic')
    const service = new AppIdentityService({
      listApps: vi.fn().mockResolvedValue([
        {
          id: 'cursor',
          displayName: 'Cursor',
          platform: 'macos',
          path: '/Applications/Cursor.app',
          source: 'detected'
        }
      ]),
      getFrontmostApp: vi.fn().mockResolvedValue(null),
      resolveBundleIconDataUrl,
      resolveIconDataUrl
    })

    await expect(service.listApps()).resolves.toEqual([
      expect.objectContaining({
        id: 'cursor',
        iconDataUrl: 'data:image/png;base64,bundle'
      })
    ])

    expect(resolveBundleIconDataUrl).toHaveBeenCalledWith('/Applications/Cursor.app')
    expect(resolveIconDataUrl).not.toHaveBeenCalled()
  })
})
