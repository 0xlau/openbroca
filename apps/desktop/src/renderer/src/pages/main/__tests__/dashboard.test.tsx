// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createStore } from 'zustand'

vi.mock('@renderer/trpc', () => ({
  trpc: {
    app: {
      getAppVersion: {
        useQuery: () => ({ data: '1.0.0' })
      }
    },
    history: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: 'record-1',
              createdAt: '2026-04-02T10:00:00.000Z',
              updatedAt: '2026-04-02T10:00:00.000Z',
              status: 'completed',
              audioDurationMs: 1000,
              finalText: 'Send the report by Friday.',
              audioFileUrl: 'file:///tmp/one.wav',
              failureStage: null
            }
          ]
        })
      },
      getById: {
        useQuery: (_input: { id: string }, opts?: { enabled?: boolean }) => ({
          data: opts?.enabled
            ? {
                id: 'record-1',
                createdAt: '2026-04-02T10:00:00.000Z',
                updatedAt: '2026-04-02T10:00:00.000Z',
                status: 'completed',
                audioDurationMs: 1000,
                finalText: 'Send the report by Friday.',
                audioFileUrl: 'file:///tmp/one.wav',
                failureStage: null,
                debug: {
                  rawTranscriptionText: 'send the report by friday',
                  asrRequest: { language: 'en' },
                  asrResponseSummary: { segmentCount: 1 },
                  llmRequest: { model: 'gpt-5.2-codex' },
                  llmResponseSummary: { finishReason: 'stop' },
                  tokenUsage: { promptTokens: 12, completionTokens: 9, totalTokens: 21 },
                  timeline: [],
                  errors: []
                }
              }
            : null
        })
      }
    }
  }
}))

const settingsStore = createStore(() => ({
  data: { language: 'en', theme: 'system', debugMode: false },
  isHydrated: true,
  update: async (partial: { debugMode?: boolean }) => {
    settingsStore.setState((state) => ({
      ...state,
      data: { ...state.data, ...partial }
    }))
  },
  replace: async () => undefined,
  hydrate: async () => undefined
}))

vi.mock('@renderer/stores/settings-store', () => ({
  settingsStore
}))

vi.mock('@openbroca/ui', () => ({
  ChartContainer: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  ChartTooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartTooltipContent: () => <div>Tooltip</div>,
  Kbd: ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>,
  KbdGroup: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Separator: () => <hr />,
  TypographyH1: ({
    children,
    className,
    style
  }: {
    children: ReactNode
    className?: string
    style?: React.CSSProperties
  }) => (
    <h1 className={className} style={style}>
      {children}
    </h1>
  ),
  TypographyLarge: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  TypographyMuted: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <p className={className}>{children}</p>,
  TypographySmall: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <p className={className}>{children}</p>
}))

vi.mock('recharts', () => ({
  Bar: () => <div>Bar</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>
}))

describe('Dashboard', () => {
  beforeEach(() => {
    cleanup()
    settingsStore.setState((state) => ({
      ...state,
      data: { ...state.data, debugMode: false }
    }))
  })

  test('constrains and centers the page content', async () => {
    const { Dashboard } = await import('../dashboard')

    const { container } = render(<Dashboard />)

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })

  test('renders persisted history and only shows debug sections when debug mode is enabled', async () => {
    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expect(screen.getByText('Send the report by Friday.')).toBeTruthy()
    expect(screen.queryByText('send the report by friday')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /debug mode/i }))
    fireEvent.click(screen.getByText('Send the report by Friday.'))

    expect(screen.getByText('send the report by friday')).toBeTruthy()
    const audio = screen.getByLabelText('History audio playback')
    expect(audio.getAttribute('src')).toBe('file:///tmp/one.wav')
  })
})
