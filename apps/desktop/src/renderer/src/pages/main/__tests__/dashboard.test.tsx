// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createStore } from 'zustand'

const selectedHistoryRecord: {
  id: string
  createdAt: string
  updatedAt: string
  status: string
  audioDurationMs: number
  finalText: string | null
  audioFileUrl: string | null
  failureStage: string | null
  failureMessage: string | null
  debug: {
    rawTranscriptionText: string
    asrRequest: Record<string, unknown>
    asrResponseSummary: Record<string, unknown>
    llmRequest: Record<string, unknown>
    llmResponseSummary: Record<string, unknown>
    tokenUsage: Record<string, unknown>
    timeline: unknown[]
    errors: unknown[]
  }
} = {
  id: 'record-1',
  createdAt: '2026-04-02T10:00:00.000Z',
  updatedAt: '2026-04-02T10:00:00.000Z',
  status: 'completed',
  audioDurationMs: 1000,
  finalText: 'Send the report by Friday.',
  audioFileUrl: 'openbroca-media://history/record-1',
  failureStage: null,
  failureMessage: null,
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

type HistoryListItem = {
  id: string
  createdAt: string
  updatedAt: string
  status: string
  audioDurationMs: number
  finalText?: string | null
  audioFileUrl?: string | null
  failureStage: string | null
  failureMessage?: string | null
}

let historyListRecords: HistoryListItem[] = [
  {
    id: 'record-1',
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    status: 'completed',
    audioDurationMs: 1000,
    finalText: 'Send the report by Friday.',
    audioFileUrl: 'openbroca-media://history/record-1',
    failureStage: null,
    failureMessage: null
  }
]

const playMock = vi.fn(() => Promise.resolve())
const pauseMock = vi.fn()

Object.defineProperty(globalThis.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: playMock
})

Object.defineProperty(globalThis.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: pauseMock
})

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
          data: historyListRecords
        })
      },
      getById: {
        useQuery: (_input: { id: string }, opts?: { enabled?: boolean }) => ({
          data: opts?.enabled ? selectedHistoryRecord : null
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
  Alert: ({
    children,
    className,
    variant
  }: {
    children: ReactNode
    className?: string
    variant?: string
  }) => (
    <div className={className} data-variant={variant} role="alert">
      {children}
    </div>
  ),
  AlertDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AlertTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Button: ({
    children,
    className,
    ...props
  }: {
    children: ReactNode
    className?: string
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
  ChartContainer: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  ChartTooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartTooltipContent: () => <div>Tooltip</div>,
  Dialog: ({
    open,
    children
  }: {
    open?: boolean
    children: ReactNode
  }) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
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

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true">icon</span>
}))

vi.mock('@hugeicons/core-free-icons', () => ({
  AlertCircleIcon: {},
  Bug02Icon: {},
  PauseIcon: {},
  PlayIcon: {}
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
    playMock.mockClear()
    pauseMock.mockClear()
    historyListRecords = [
      {
        id: 'record-1',
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
        status: 'completed',
        audioDurationMs: 1000,
        finalText: 'Send the report by Friday.',
        audioFileUrl: 'openbroca-media://history/record-1',
        failureStage: null,
        failureMessage: null
      }
    ]
    selectedHistoryRecord.finalText = 'Send the report by Friday.'
    selectedHistoryRecord.failureMessage = null
    selectedHistoryRecord.debug.rawTranscriptionText = 'send the report by friday'
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

  test('renders history rows with inline controls and opens details in a dialog', async () => {
    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expect(screen.getByText('Send the report by Friday.')).toBeTruthy()
    expect(screen.getByText(new Date('2026-04-02T10:00:00.000Z').toLocaleString())).toBeTruthy()
    expect(screen.getByText('Send the report by Friday.').className).toContain('line-clamp-3')
    expect(screen.queryByText('Details')).toBeNull()
    expect(screen.queryByText('send the report by friday')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /play history audio/i }))
    expect(playMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /show history details/i }))

    expect(screen.getByTestId('dialog-root')).toBeTruthy()
    expect(screen.getByText('Debug')).toBeTruthy()
    expect(screen.getByText('send the report by friday')).toBeTruthy()
    expect(screen.getByText('send the report by friday').className).toContain('min-h-[4.5rem]')
    const audio = screen.getByLabelText('History audio playback')
    expect(audio.getAttribute('src')).toBe('openbroca-media://history/record-1')
  })

  test('renders failure messages inside a destructive alert', async () => {
    selectedHistoryRecord.finalText = null
    selectedHistoryRecord.failureMessage = 'ASR pipeline failed.'

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    fireEvent.click(screen.getByRole('button', { name: /show history details/i }))

    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('data-variant')).toBe('destructive')
    expect(screen.getByText('ASR pipeline failed.')).toBeTruthy()
  })

  test('hides records without meaningful llm output when debug mode is off', async () => {
    historyListRecords = [
      historyListRecords[0]!,
      {
        id: 'record-failed',
        createdAt: '2026-04-02T09:59:00.000Z',
        updatedAt: '2026-04-02T09:59:00.000Z',
        status: 'failed',
        audioDurationMs: 1000,
        finalText: null,
        audioFileUrl: 'openbroca-media://history/record-failed',
        failureStage: 'llm',
        failureMessage: 'upstream 500'
      },
      {
        id: 'record-processing',
        createdAt: '2026-04-02T09:58:00.000Z',
        updatedAt: '2026-04-02T09:58:00.000Z',
        status: 'processing',
        audioDurationMs: 1000,
        finalText: null,
        audioFileUrl: 'openbroca-media://history/record-processing',
        failureStage: null,
        failureMessage: null
      },
      {
        id: 'record-empty',
        createdAt: '2026-04-02T09:57:00.000Z',
        updatedAt: '2026-04-02T09:57:00.000Z',
        status: 'completed',
        audioDurationMs: 1000,
        finalText: '   ',
        audioFileUrl: 'openbroca-media://history/record-empty',
        failureStage: null,
        failureMessage: null
      }
    ]

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expect(screen.getAllByRole('button', { name: /show history details/i })).toHaveLength(1)
    expect(screen.queryByText('upstream 500')).toBeNull()
    expect(screen.queryByText('Processing...')).toBeNull()
  })

  test('shows all records when debug mode is on', async () => {
    historyListRecords = [
      historyListRecords[0]!,
      {
        id: 'record-failed',
        createdAt: '2026-04-02T09:59:00.000Z',
        updatedAt: '2026-04-02T09:59:00.000Z',
        status: 'failed',
        audioDurationMs: 1000,
        finalText: null,
        audioFileUrl: 'openbroca-media://history/record-failed',
        failureStage: 'llm',
        failureMessage: 'upstream 500'
      },
      {
        id: 'record-processing',
        createdAt: '2026-04-02T09:58:00.000Z',
        updatedAt: '2026-04-02T09:58:00.000Z',
        status: 'processing',
        audioDurationMs: 1000,
        finalText: null,
        audioFileUrl: 'openbroca-media://history/record-processing',
        failureStage: null,
        failureMessage: null
      },
      {
        id: 'record-empty',
        createdAt: '2026-04-02T09:57:00.000Z',
        updatedAt: '2026-04-02T09:57:00.000Z',
        status: 'completed',
        audioDurationMs: 1000,
        finalText: '   ',
        audioFileUrl: 'openbroca-media://history/record-empty',
        failureStage: null,
        failureMessage: null
      }
    ]
    settingsStore.setState((state) => ({
      ...state,
      data: { ...state.data, debugMode: true }
    }))

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expect(screen.getAllByRole('button', { name: /show history details/i })).toHaveLength(4)
    expect(screen.getByText('upstream 500')).toBeTruthy()
    expect(screen.getByText('Processing...')).toBeTruthy()
  })
})
