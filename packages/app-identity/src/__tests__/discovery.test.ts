import { describe, expect, test, vi } from 'vitest'
import { createDiscoveryClient } from '../discovery'

describe('createDiscoveryClient', () => {
  test('dedupes detected app results and normalizes the frontmost app', async () => {
    const client = createDiscoveryClient({
      platform: 'windows',
      listDetectedApps: vi.fn().mockResolvedValue([
        {
          displayName: 'Chrome',
          platform: 'windows',
          path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          source: 'detected'
        },
        {
          displayName: 'Google Chrome',
          platform: 'windows',
          path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          source: 'detected'
        }
      ]),
      getDetectedFrontmostApp: vi.fn().mockResolvedValue({
        displayName: 'Chrome',
        platform: 'windows',
        path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        source: 'detected'
      })
    })

    await expect(client.listApps()).resolves.toHaveLength(1)
    await expect(client.getFrontmostApp()).resolves.toMatchObject({
      id: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      displayName: 'Chrome'
    })
  })
})
