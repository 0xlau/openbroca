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
    expect(screen.getByText('Used 7 times')).toBeTruthy()
  })

  test('adds a new hotword through the inline form', async () => {
    const { Dictionary } = await import('../dictionary')

    render(<Dictionary />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hotword' }))
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
      note: 'ASR model name',
      usageCount: 0
    })
  })
})
