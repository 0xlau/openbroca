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

describe('dictionaryStore', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('normalizes malformed persisted dictionary values during hydration', async () => {
    storeGetQueryMock.mockResolvedValue(null)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { dictionaryStore } = await import('../dictionary-store')
    await dictionaryStore.getState().hydrate()

    storeGetQueryMock.mockClear()
    storeGetQueryMock.mockResolvedValueOnce({
      entries: [
        { id: ' entry-1 ', term: ' Open Broca ', replacement: ' OpenBroca ', usageCount: 2 },
        { id: '   ', term: 'drop blank id', usageCount: 1 },
        { term: 'drop missing id', usageCount: 1 },
        { id: 'entry-2', term: '   ', usageCount: 1 }
      ]
    })

    await dictionaryStore.getState().hydrate()

    expect(storeGetQueryMock).toHaveBeenCalledTimes(1)
    expect(dictionaryStore.getState().data).toEqual({
      entries: [
        {
          id: 'entry-1',
          term: 'Open Broca',
          replacement: 'OpenBroca',
          type: undefined,
          note: undefined,
          usageCount: 2,
          createdAt: '',
          updatedAt: ''
        }
      ]
    })
  })

  test('normalizes external dictionary updates from store watch events', async () => {
    storeGetQueryMock.mockResolvedValue(null)

    let onData: ((newValue: unknown) => void) | undefined
    storeWatchSubscribeMock.mockImplementation((_input, opts) => {
      onData = opts.onData
      return { unsubscribe: vi.fn() }
    })

    const { dictionaryStore } = await import('../dictionary-store')
    await dictionaryStore.getState().hydrate()

    onData?.({
      entries: [
        { id: 'entry-3', term: ' Typeless ', type: 'hotword', usageCount: 3 },
        { id: 99, term: 'drop non-string id', usageCount: 1 },
        { id: '   ', term: 'drop blank id', usageCount: 1 }
      ]
    })

    expect(dictionaryStore.getState().data).toEqual({
      entries: [
        {
          id: 'entry-3',
          term: 'Typeless',
          type: 'hotword',
          replacement: undefined,
          note: undefined,
          usageCount: 3,
          createdAt: '',
          updatedAt: ''
        }
      ]
    })
  })
})
