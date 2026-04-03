import { afterEach, describe, expect, test, vi } from 'vitest'

const { storeGetQueryMock, storeSetMutateMock, storeWatchSubscribeMock } = vi.hoisted(() => ({
  storeGetQueryMock: vi.fn(),
  storeSetMutateMock: vi.fn(),
  storeWatchSubscribeMock: vi.fn()
}))

vi.mock('../../trpc/client', () => ({
  trpcClient: {
    store: {
      get: {
        query: storeGetQueryMock
      },
      set: {
        mutate: storeSetMutateMock
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

  test('normalizes duplicate app ownership before persisting updates', async () => {
    storeGetQueryMock.mockResolvedValueOnce(null)
    storeSetMutateMock.mockResolvedValue(undefined)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { instructionsStore } = await import('../instructions-store')
    await instructionsStore.getState().hydrate()

    await instructionsStore.getState().update({
      rules: [
        {
          id: 'rule-coding',
          name: ' Coding ',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Prefer concise language',
          autoEnter: true
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
          autoEnter: false
        }
      ]
    })

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
          customInstructions: 'Prefer concise language',
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
    expect(storeSetMutateMock).toHaveBeenLastCalledWith({
      key: 'instructions',
      value: {
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
            customInstructions: 'Prefer concise language',
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
      }
    })
  })

  test('normalizes duplicate app ownership before persisting replacements', async () => {
    storeGetQueryMock.mockResolvedValueOnce(null)
    storeSetMutateMock.mockResolvedValue(undefined)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { instructionsStore } = await import('../instructions-store')
    await instructionsStore.getState().hydrate()

    await instructionsStore.getState().replace({
      rules: [
        {
          id: 'rule-coding',
          name: ' Coding ',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Prefer concise language',
          autoEnter: true
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
          autoEnter: false
        }
      ]
    })

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
          customInstructions: 'Prefer concise language',
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
    expect(storeSetMutateMock).toHaveBeenLastCalledWith({
      key: 'instructions',
      value: {
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
            customInstructions: 'Prefer concise language',
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
      }
    })
  })
})
