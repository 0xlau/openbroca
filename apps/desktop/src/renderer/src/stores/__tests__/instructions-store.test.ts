import { afterEach, describe, expect, test, vi } from 'vitest'

const { storeGetQueryMock, storeWatchSubscribeMock } = vi.hoisted(() => ({
  storeGetQueryMock: vi.fn(),
  storeWatchSubscribeMock: vi.fn()
}))

vi.mock('../../trpc/client', () => ({
  trpcClient: {
    store: {
      get: {
        query: storeGetQueryMock
      },
      set: {
        mutate: vi.fn()
      },
      watch: {
        subscribe: storeWatchSubscribeMock
      }
    }
  }
}))

describe('instructionsStore', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('hydrates by normalizing duplicate app ownership to the first matching rule', async () => {
    storeGetQueryMock.mockResolvedValueOnce({
      rules: [
        {
          id: 'rule-coding',
          name: '  Coding  ',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            },
            {
              id: '',
              displayName: 'Invalid App',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 42,
          autoEnter: 'truthy'
        },
        {
          id: 'rule-writing',
          name: ' Writing ',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor Duplicate',
              platform: 'macos',
              source: 'detected'
            },
            {
              id: 'company.thebrowser.Browser',
              displayName: 'Arc',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Summarize clearly',
          autoEnter: 0
        }
      ]
    })
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { instructionsStore } = await import('../instructions-store')
    await instructionsStore.getState().hydrate()

    expect(instructionsStore.getState().data).toEqual({
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: '',
          autoEnter: true
        },
        {
          id: 'rule-writing',
          name: 'Writing',
          activationApps: [
            {
              id: 'company.thebrowser.Browser',
              displayName: 'Arc',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Summarize clearly',
          autoEnter: false
        }
      ]
    })
  })
})
