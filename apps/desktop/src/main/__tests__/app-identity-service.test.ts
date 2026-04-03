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
})
