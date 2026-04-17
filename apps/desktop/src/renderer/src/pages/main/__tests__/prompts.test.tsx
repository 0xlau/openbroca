// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  test('uses the shared default template text when persisted template is whitespace-only', async () => {
    promptsStoreMock = createPromptsStore({ template: '  \n\t  ' })
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

  test('shows save error and keeps dirty state when update is rejected', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Persisted template' })
    const rejectedUpdate = vi.fn(async () => {
      throw new Error('Failed to save prompt template')
    })
    promptsStoreMock.setState((state) => ({ ...state, update: rejectedUpdate }))
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: { value: 'Local unsaved edit' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(rejectedUpdate).toHaveBeenCalledWith({
        template: 'Local unsaved edit'
      })
    })

    expect(await screen.findByText('Failed to save prompt template')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
      'Local unsaved edit'
    )
  })

  test('does not overwrite unsaved local edits when persisted state changes externally', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Persisted template' })
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: { value: 'Locally edited draft' }
    })

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()

    act(() => {
      promptsStoreMock.setState((state) => ({
        ...state,
        data: { template: 'Server updated template' }
      }))
    })

    await waitFor(() => {
      expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
        'Locally edited draft'
      )
    })

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
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

  test('treats whitespace-only edited template as no custom template when saving', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Custom persisted template' })
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: { value: ' \n\t ' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(promptsStoreMock.getState().update).toHaveBeenCalledWith({
        template: ''
      })
    })

    await waitFor(() => {
      expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
        defaultPromptTemplateText
      )
    })

    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  test('does not overwrite externally updated persisted template when save fails', async () => {
    promptsStoreMock = createPromptsStore({ template: 'Persisted template' })
    let rejectSave: ((error: Error) => void) | null = null
    const rejectedUpdate = vi.fn(
      async () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        })
    )
    promptsStoreMock.setState((state) => ({ ...state, update: rejectedUpdate }))
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: { value: 'Local unsaved edit' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(rejectedUpdate).toHaveBeenCalledWith({
        template: 'Local unsaved edit'
      })
    })

    act(() => {
      promptsStoreMock.setState((state) => ({
        ...state,
        data: { template: 'Server updated template' }
      }))
    })

    act(() => {
      rejectSave?.(new Error('Failed to save prompt template'))
    })

    expect(await screen.findByText('Failed to save prompt template')).toBeTruthy()
    expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toBe(
      'Local unsaved edit'
    )
    expect(promptsStoreMock.getState().data.template).toBe('Server updated template')
  })

  test('shows a static helper line for the three supported placeholders', async () => {
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    expect(
      screen.getByText(
        'You can use {{dictionary}}, {{about_me}}, and {{matched_instructions}} in the template.'
      )
    ).toBeTruthy()
  })

  test('constrains and centers the page content', async () => {
    const { Prompts } = await import('../prompts')

    const { container } = render(<Prompts />)

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })
})
