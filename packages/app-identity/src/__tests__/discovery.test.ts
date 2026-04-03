import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDiscoveryClient } from '../discovery'
import { getMacFrontmostApp, listMacApps } from '../platform/macos'
import { getWindowsFrontmostApp, listWindowsApps } from '../platform/windows'

const readdirMock = vi.hoisted(() => vi.fn())
const openWindowsMock = vi.hoisted(() => vi.fn())
const activeWindowMock = vi.hoisted(() => vi.fn())
const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  readdir: readdirMock
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('get-windows', () => ({
  activeWindow: activeWindowMock,
  openWindows: openWindowsMock
}))

function createDirent(name: string, isDirectory: boolean) {
  return {
    name,
    isDirectory: () => isDirectory
  }
}

function mockStartApps(items: Array<{ Name?: string; AppID?: string }>) {
  execFileMock.mockImplementation((_file, _args, callback) => {
    callback(null, JSON.stringify(items), '')
  })
}

beforeEach(() => {
  readdirMock.mockReset()
  openWindowsMock.mockReset()
  activeWindowMock.mockReset()
  execFileMock.mockReset()
})

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

    expect(openWindowsMock).toHaveBeenCalledWith({
      accessibilityPermission: false,
      screenRecordingPermission: false
    })
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

describe('getMacFrontmostApp', () => {
  test('queries active window without prompting for permissions', async () => {
    activeWindowMock.mockResolvedValue({
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
    })

    const app = await getMacFrontmostApp()

    expect(activeWindowMock).toHaveBeenCalledWith({
      accessibilityPermission: false,
      screenRecordingPermission: false
    })
    expect(app).toMatchObject({
      displayName: 'Cursor',
      path: '/Applications/Cursor.app',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      source: 'detected'
    })
  })
})

describe('windows identity alignment', () => {
  test('maps running and frontmost windows to matching start-app aumid by exact app name', async () => {
    mockStartApps([{ Name: 'ChatGPT', AppID: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT' }])
    openWindowsMock.mockResolvedValue([
      {
        platform: 'windows',
        title: 'ChatGPT',
        id: 1,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        contentBounds: { x: 0, y: 0, width: 800, height: 600 },
        memoryUsage: 1,
        owner: {
          name: 'ChatGPT',
          processId: 101,
          path: 'C:\\Program Files\\OpenAI\\ChatGPT\\ChatGPT.exe'
        }
      }
    ])
    activeWindowMock.mockResolvedValue({
      platform: 'windows',
      title: 'ChatGPT',
      id: 1,
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      contentBounds: { x: 0, y: 0, width: 800, height: 600 },
      memoryUsage: 1,
      owner: {
        name: 'ChatGPT',
        processId: 101,
        path: 'C:\\Program Files\\OpenAI\\ChatGPT\\ChatGPT.exe'
      }
    })

    const apps = await listWindowsApps()
    const frontmost = await getWindowsFrontmostApp()

    expect(apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'ChatGPT',
          path: 'C:\\Program Files\\OpenAI\\ChatGPT\\ChatGPT.exe',
          aumid: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT'
        }),
        expect.objectContaining({
          displayName: 'ChatGPT',
          aumid: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT',
          source: 'detected'
        })
      ])
    )
    expect(frontmost).toMatchObject({
      displayName: 'ChatGPT',
      path: 'C:\\Program Files\\OpenAI\\ChatGPT\\ChatGPT.exe',
      aumid: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT'
    })
  })
})
