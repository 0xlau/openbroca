// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'
import type { PersistedStoreState } from '@renderer/stores/create-persisted-store'

type PromptTemplateSettings = {
  template: string
}

type PromptStoreState = PersistedStoreState<PromptTemplateSettings>

const defaultPromptTemplateText = [
  'You are an accurate post-processing editor for dictated text.',
  '',
  'Return only the cleaned final text, with no commentary.'
].join('\n')

const promptTemplatePlaceholders = [
  {
    token: '{{dictionary}}',
    label: 'Dictionary',
    description: 'Canonical terminology rules and replacements from the user dictionary.',
    availability: 'available' as const
  },
  {
    token: '{{about_me.nickname}}',
    label: 'About Me Nickname',
    description: "The user's preferred nickname from About Me settings.",
    availability: 'available' as const
  },
  {
    token: '{{raw_transcript}}',
    label: 'Raw Transcript',
    description: 'The unedited transcript text captured from dictation input.',
    availability: 'planned' as const
  }
]

let promptsStoreMock: ReturnType<typeof createPromptsStore>

function createPromptsStore(data: PromptTemplateSettings) {
  return createStore<PromptStoreState>((set, get) => ({
    data,
    isHydrated: true,
    update: vi.fn(async (partial) => {
      set({ data: { ...get().data, ...partial } })
    }),
    replace: vi.fn(async (nextData) => {
      set({ data: nextData })
    }),
    hydrate: vi.fn(async () => {})
  }))
}

vi.mock('@renderer/stores/prompts-store', () => ({
  defaultPromptTemplateText,
  promptTemplatePlaceholders,
  get promptsStore() {
    return promptsStoreMock
  }
}))

describe('Prompts', () => {
  beforeEach(() => {
    cleanup()
    vi.resetModules()
    promptsStoreMock = createPromptsStore({ template: '' })
  })

  test('uses the shared default template text when persisted template is empty', async () => {
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
      defaultPromptTemplateText
    )
  })

  test('uses the persisted template when present', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Saved prompt template body' })
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
      'Saved prompt template body'
    )
  })

  test('shows save only when dirty and persists the full template without placeholder validation', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Saved prompt template body' })
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: { value: 'Saved prompt template body {{unknown_token}}' }
    })

    const saveButton = await screen.findByRole('button', { name: 'Save changes' })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(promptsStoreMock.getState().update).toHaveBeenCalledWith({
        template: 'Saved prompt template body {{unknown_token}}'
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    })
  })

  test('resets editor to shared default and requires explicit save for persistence', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Custom persisted template' })
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    fireEvent.click(screen.getByRole('button', { name: 'Use default template' }))

    expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
      defaultPromptTemplateText
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeNull()
    expect(promptsStoreMock.getState().update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(promptsStoreMock.getState().update).toHaveBeenCalledWith({
        template: defaultPromptTemplateText
      })
    })
  })

  test('groups placeholder references by available and planned', async () => {
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    expect(screen.getByText('Available placeholders')).toBeTruthy()
    expect(screen.getByText('Planned placeholders')).toBeTruthy()
    expect(screen.getByRole('button', { name: '{{dictionary}}' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '{{raw_transcript}}' })).toBeTruthy()
  })

  test('inserts placeholder tokens at caret and appends when caret is unavailable', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Hello World' })
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    const textarea = screen.getByLabelText('Prompt template') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(6, 6)

    const dictionaryButton = screen.getByRole('button', { name: '{{dictionary}}' })
    fireEvent.mouseDown(dictionaryButton)
    fireEvent.click(dictionaryButton)

    expect(textarea.value).toBe('Hello {{dictionary}}World')

    const originalSelectionStart = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'selectionStart'
    )
    const originalSelectionEnd = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'selectionEnd'
    )

    Object.defineProperty(HTMLTextAreaElement.prototype, 'selectionStart', {
      configurable: true,
      get() {
        return null
      }
    })
    Object.defineProperty(HTMLTextAreaElement.prototype, 'selectionEnd', {
      configurable: true,
      get() {
        return null
      }
    })

    fireEvent.click(screen.getByRole('button', { name: '{{raw_transcript}}' }))
    expect(textarea.value).toBe('Hello {{dictionary}}World{{raw_transcript}}')

    if (originalSelectionStart) {
      Object.defineProperty(HTMLTextAreaElement.prototype, 'selectionStart', originalSelectionStart)
    }
    if (originalSelectionEnd) {
      Object.defineProperty(HTMLTextAreaElement.prototype, 'selectionEnd', originalSelectionEnd)
    }
  })

  test('constrains and centers the page content', async () => {
    const { Prompts } = await import('../prompts')

    const { container } = render(<Prompts />)

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })
})
