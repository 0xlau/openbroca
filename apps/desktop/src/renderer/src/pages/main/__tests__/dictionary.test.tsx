// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { createStore } from 'zustand'

const replaceMock = vi.fn()
const updateMock = vi.fn()

vi.mock('@openbroca/ui', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    type = 'button',
    disabled
  }: {
    children: ReactNode
    onClick?: () => void
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({
    children,
    open
  }: {
    children: ReactNode
    open?: boolean
  }) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  Empty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  EmptyHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  Separator: () => <hr />,
  Switch: ({
    checked,
    onCheckedChange,
    id
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    id?: string
  }) => (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
  TypographyH3: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  TypographyLarge: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  TypographyMuted: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <p className={className}>{children}</p>,
  TypographySmall: ({ children }: { children: ReactNode }) => <p>{children}</p>
}))

const dictionaryStore = createStore(() => ({
  data: {
    entries: [
      {
        id: 'hello',
        term: 'OpenBroca',
        type: 'hotword',
        note: 'Product name',
        usageCount: 7,
        createdAt: '2026-03-28T08:00:00.000Z',
        updatedAt: '2026-03-28T08:00:00.000Z'
      }
    ]
  },
  isHydrated: true,
  update: updateMock,
  replace: replaceMock,
  hydrate: vi.fn()
}))

vi.mock('@renderer/stores/dictionary-store', () => ({
  dictionaryStore
}))

describe('Dictionary', () => {
  beforeEach(() => {
    cleanup()
    replaceMock.mockReset()
    updateMock.mockReset()
  })

  test('renders existing hotwords with their usage count', async () => {
    const { Dictionary } = await import('../dictionary')

    render(<Dictionary />)

    expect(screen.getByText('OpenBroca')).toBeTruthy()
    expect(screen.getByText('Product name')).toBeTruthy()
  })

  test('adds a new hotword through the dialog', async () => {
    const { Dictionary } = await import('../dictionary')

    render(<Dictionary />)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(screen.getByLabelText('Hotword'), { target: { value: 'Whisper' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'ASR model name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1)
    })

    const nextState = replaceMock.mock.calls[0]?.[0]
    expect(nextState.entries).toHaveLength(2)
    expect(nextState.entries[1]).toMatchObject({
      term: 'Whisper',
      type: 'hotword',
      note: 'ASR model name',
      usageCount: 0
    })
  })

  test('adds a replacement and stores both source and target text', async () => {
    const { Dictionary } = await import('../dictionary')

    render(<Dictionary />)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('switch'))

    expect(screen.getByText('Add a replacement')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'open broker' } })
    fireEvent.change(screen.getByLabelText('Replacement'), { target: { value: 'OpenBroca' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Prefer the product name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1)
    })

    const nextState = replaceMock.mock.calls[0]?.[0]
    expect(nextState.entries[1]).toMatchObject({
      term: 'open broker',
      type: 'replacement',
      replacement: 'OpenBroca',
      note: 'Prefer the product name',
      usageCount: 0
    })
  })

  test('renders replacements in the list', async () => {
    const replacementStore = createStore(() => ({
      data: {
        entries: [
          {
            id: 'replacement-1',
            term: 'open broker',
            type: 'replacement',
            replacement: 'OpenBroca',
            note: 'Prefer product spelling',
            usageCount: 3,
            createdAt: '2026-03-29T08:00:00.000Z',
            updatedAt: '2026-03-29T08:00:00.000Z'
          }
        ]
      },
      isHydrated: true,
      update: updateMock,
      replace: replaceMock,
      hydrate: vi.fn()
    }))

    vi.doMock('@renderer/stores/dictionary-store', () => ({
      dictionaryStore: replacementStore
    }))

    vi.resetModules()
    const { Dictionary } = await import('../dictionary')

    render(<Dictionary />)

    expect(screen.getByText('open broker')).toBeTruthy()
    expect(screen.getByText('OpenBroca')).toBeTruthy()
    expect(screen.getByText('Prefer product spelling')).toBeTruthy()
  })

  test('constrains and centers the page content', async () => {
    const { Dictionary } = await import('../dictionary')

    const { container } = render(<Dictionary />)

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })
})
