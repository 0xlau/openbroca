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

describe('aboutMeStore', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('normalizes malformed persisted about me values during hydration', async () => {
    storeGetQueryMock.mockResolvedValue(null)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { aboutMeStore } = await import('../about-me-store')
    await aboutMeStore.getState().hydrate()

    storeGetQueryMock.mockClear()
    storeGetQueryMock.mockResolvedValueOnce({
      nickname: '  Peiqiang  ',
      email: 123,
      occupation: ' Engineer ',
      bio: null
    })

    await aboutMeStore.getState().hydrate()

    expect(storeGetQueryMock).toHaveBeenCalledTimes(1)
    expect(aboutMeStore.getState().data).toEqual({
      nickname: 'Peiqiang',
      email: '',
      occupation: 'Engineer',
      bio: ''
    })
  })

  test('normalizes external about me updates from store watch events', async () => {
    storeGetQueryMock.mockResolvedValue(null)

    let onData: ((newValue: unknown) => void) | undefined
    storeWatchSubscribeMock.mockImplementation((_input, opts) => {
      onData = opts.onData
      return { unsubscribe: vi.fn() }
    })

    const { aboutMeStore } = await import('../about-me-store')
    await aboutMeStore.getState().hydrate()

    onData?.({
      nickname: '  Taylor  ',
      email: { value: 'taylor@example.com' },
      occupation: ' Designer ',
      bio: 42
    })

    expect(aboutMeStore.getState().data).toEqual({
      nickname: 'Taylor',
      email: '',
      occupation: 'Designer',
      bio: ''
    })
  })
})
