import { describe, expect, test, vi } from 'vitest'
import { createDiscoveryClient } from '../discovery'
import { listMacApps } from '../platform/macos'

const readdirMock = vi.hoisted(() => vi.fn())
const openWindowsMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock
}))

vi.mock('get-windows', () => ({
  activeWindow: vi.fn(),
  openWindows: openWindowsMock
}))

function createDirent(name: string, isDirectory: boolean) {
  return {
    name,
    isDirectory: () => isDirectory
  }
}

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

describe('listMacApps', () => {
  test('includes running apps alongside applications directory scan', async () => {
    openWindowsMock.mockResolvedValue([
      {
        platform: 'macos',
        title: 'Cursor',
        id: 1,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        memoryUsage: 1,
        owner: {
          name: 'Cursor',
          processId: 101,
          path: '/Applications/Cursor.app',
          bundleId: 'com.todesktop.230313mzl4w4u92'
        }
      }
    ])
    readdirMock
      .mockResolvedValueOnce([createDirent('Arc.app', true), createDirent('README.md', false)])
      .mockResolvedValueOnce([createDirent('Notes.app', true)])

    const apps = await listMacApps()

    expect(openWindowsMock).toHaveBeenCalledTimes(1)
    expect(apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Cursor',
          platform: 'macos',
          path: '/Applications/Cursor.app',
          bundleId: 'com.todesktop.230313mzl4w4u92',
          source: 'detected'
        }),
        expect.objectContaining({
          displayName: 'Arc',
          platform: 'macos',
          path: '/Applications/Arc.app',
          source: 'detected'
        }),
        expect.objectContaining({
          displayName: 'Notes',
          platform: 'macos',
          path: expect.stringMatching(/[\\/]Applications[\\/]Notes\.app$/u),
          source: 'detected'
        })
      ])
    )
  })
})
