import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  defaultPromptTemplateSettings,
  defaultPromptTemplateText,
  normalizePromptTemplateSettings
} from '../../../../shared/prompt-template'

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

describe('prompt-template shared normalization', () => {
  test('uses empty persisted template by default and ships a non-empty starter template', () => {
    expect(defaultPromptTemplateSettings).toEqual({ template: '' })
    expect(defaultPromptTemplateText.trim().length).toBeGreaterThan(0)
  })

  test('default prompt template text mentions the three supported placeholders', () => {
    expect(defaultPromptTemplateText).toContain('{{dictionary}}')
    expect(defaultPromptTemplateText).toContain('{{about_me}}')
    expect(defaultPromptTemplateText).toContain('{{matched_instructions}}')
    expect(defaultPromptTemplateText).not.toContain('{{raw_transcript}}')
  })

  test('preserves template whitespace while coercing malformed payloads', () => {
    expect(normalizePromptTemplateSettings({ template: '  keep leading and trailing  ' })).toEqual({
      template: '  keep leading and trailing  '
    })
    expect(normalizePromptTemplateSettings({ template: 123 })).toEqual({ template: '' })
    expect(normalizePromptTemplateSettings(null)).toEqual({ template: '' })
  })
})

describe('promptsStore', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('normalizes malformed persisted prompt template values during hydration', async () => {
    storeGetQueryMock.mockResolvedValue(null)
    storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

    const { promptsStore } = await import('../prompts-store')
    await promptsStore.getState().hydrate()

    storeGetQueryMock.mockClear()
    storeGetQueryMock.mockResolvedValueOnce({
      template: '  Keep spacing exactly  '
    })

    await promptsStore.getState().hydrate()

    expect(storeGetQueryMock).toHaveBeenCalledTimes(1)
    expect(promptsStore.getState().data).toEqual({
      template: '  Keep spacing exactly  '
    })
  })

  test('normalizes external prompt template updates from store watch events', async () => {
    storeGetQueryMock.mockResolvedValue(null)

    let onData: ((newValue: unknown) => void) | undefined
    storeWatchSubscribeMock.mockImplementation((_input, opts) => {
      onData = opts.onData
      return { unsubscribe: vi.fn() }
    })

    const { promptsStore } = await import('../prompts-store')
    await promptsStore.getState().hydrate()

    onData?.({
      template: 42
    })

    expect(promptsStore.getState().data).toEqual({
      template: ''
    })
  })
})
