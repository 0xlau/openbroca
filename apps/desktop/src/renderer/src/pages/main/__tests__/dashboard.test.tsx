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
    asrSegments: unknown[]
    asrRequest: Record<string, unknown>
    asrResponseSummary: Record<string, unknown>
    llmRequest: Record<string, unknown>
    llmResponseSummary: Record<string, unknown>
    tokenUsage: Record<string, unknown>
    frontmostAppSnapshot: Record<string, unknown> | null
    delivery: {
      targetAppAtMatch: Record<string, unknown> | null
      targetAppAtDelivery: Record<string, unknown> | null
      matchedInstruction: {
        ruleId: string
        name: string
        autoEnterMode: string
      } | null
      instructionPromptApplied: boolean
      ownershipMatchedAtDelivery: boolean
      method: string
      status: string
      outcome: string
      pasteAttempted: boolean
      autoSendTriggered: boolean
      failureMessage?: string
      fallbackReason?: string
    }
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
    asrSegments: [{ text: 'send the report by friday', isFinal: true }],
    asrRequest: { language: 'en' },
    asrResponseSummary: { segmentCount: 1 },
    llmRequest: { model: 'gpt-5.2-codex' },
    llmResponseSummary: { finishReason: 'stop' },
    tokenUsage: { promptTokens: 12, completionTokens: 9, totalTokens: 21 },
    frontmostAppSnapshot: {
      id: 'com.slack.desktop',
      displayName: 'Slack',
      platform: 'macos',
      bundleId: 'com.slack.desktop'
    },
    delivery: {
      targetAppAtMatch: {
        id: 'com.openai.chat',
        displayName: 'ChatGPT',
        platform: 'macos',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: {
        id: 'current-chat-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        bundleId: 'com.openai.chat'
      },
      matchedInstruction: {
        ruleId: 'rule-chat',
        name: 'Chat',
        autoEnterMode: 'enter'
      },
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: true,
      method: 'paste',
      status: 'completed',
      outcome: 'paste-success',
      pasteAttempted: true,
      autoSendTriggered: true
    },
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

type HistoryStats = {
  dailyTokenUsage: Array<{
    date: string
    dayLabel: string
    tokens: number
  }>
  totalDictationTimeMs: number
  wordsDictated: number
  timeSavedMs: number
  avgDictationSpeedWpm: number
  completedDictations: number
  activeDays: number
}

type HistoryStatsQueryState = {
  data?: HistoryStats
  isLoading?: boolean
  isError?: boolean
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

let historyStats: HistoryStats = {
  dailyTokenUsage: [
    { date: '2026-04-16', dayLabel: 'Wed', tokens: 10 },
    { date: '2026-04-17', dayLabel: 'Thu', tokens: 2500 },
    { date: '2026-04-18', dayLabel: 'Fri', tokens: 0 },
    { date: '2026-04-19', dayLabel: 'Sat', tokens: 12_500 },
    { date: '2026-04-20', dayLabel: 'Sun', tokens: 300 },
    { date: '2026-04-21', dayLabel: 'Mon', tokens: 99 },
    { date: '2026-04-22', dayLabel: 'Tue', tokens: 7_654 }
  ],
  totalDictationTimeMs: 7_320_000,
  wordsDictated: 18_432,
  timeSavedMs: 4_500_000,
  avgDictationSpeedWpm: 142,
  completedDictations: 128,
  activeDays: 23
}

let historyStatsQueryState: HistoryStatsQueryState = {
  data: historyStats,
  isLoading: false,
  isError: false
}

let lastBarChartData: Array<{ date: string; dayLabel: string; tokens: number }> | undefined
let lastXAxisDataKey: string | undefined
let lastBarDataKey: string | undefined

const playMock = vi.fn(() => Promise.resolve())
const pauseMock = vi.fn()
const clipboardWriteTextMock = vi.fn(() => Promise.resolve())

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
      stats: {
        useQuery: () => historyStatsQueryState
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

vi.mock('@openbroca/ui', () => {
  let currentTabsValue: string | undefined
  let currentOnValueChange: ((value: string) => void) | undefined

  return {
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
  Card: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-slot="card">
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-slot="card-content">
      {children}
    </div>
  ),
  CardDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-slot="card-description">
      {children}
    </div>
  ),
  CardFooter: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-slot="card-footer">
      {children}
    </div>
  ),
  CardHeader: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-slot="card-header">
      {children}
    </div>
  ),
  CardTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-slot="card-title">
      {children}
    </div>
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
  DialogFooter: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  Kbd: ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>,
  KbdGroup: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Separator: () => <hr />,
  Tabs: ({
    children,
    value,
    onValueChange
  }: {
    children: ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }) => {
    currentTabsValue = value
    currentOnValueChange = onValueChange

    return <div data-tabs-value={value}>{children}</div>
  },
  TabsList: ({ children }: { children: ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({
    children,
    value
  }: {
    children: ReactNode
    value: string
  }) => (
    <button
      role="tab"
      aria-selected={currentTabsValue === value}
      data-value={value}
      onClick={() => currentOnValueChange?.(value)}
    >
      {children}
    </button>
  ),
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
  }
})

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
  Bar: ({ dataKey }: { dataKey?: string }) => {
    lastBarDataKey = dataKey
    return <div>Bar</div>
  },
  BarChart: ({
    children,
    data
  }: {
    children: ReactNode
    data?: Array<{ date: string; dayLabel: string; tokens: number }>
  }) => (
    <div
      data-testid="bar-chart"
      ref={() => {
        lastBarChartData = data
      }}
    >
      {children}
    </div>
  ),
  CartesianGrid: () => <div>CartesianGrid</div>,
  XAxis: ({ dataKey }: { dataKey?: string }) => {
    lastXAxisDataKey = dataKey
    return <div>XAxis</div>
  },
  YAxis: () => <div>YAxis</div>
}))

describe('Dashboard', () => {
  function expectSummaryRow(label: string, expectedValue: string) {
    const labelNode = screen.getByText(label)
    const row = labelNode.closest('div')
    expect(row).toBeTruthy()
    expect(row?.textContent).toContain(label)
    expect(row?.textContent).toContain(expectedValue)
  }

  beforeEach(() => {
    cleanup()
    playMock.mockClear()
    pauseMock.mockClear()
    clipboardWriteTextMock.mockClear()
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWriteTextMock
      }
    })
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
    historyStats = {
      dailyTokenUsage: [
        { date: '2026-04-16', dayLabel: 'Wed', tokens: 10 },
        { date: '2026-04-17', dayLabel: 'Thu', tokens: 2500 },
        { date: '2026-04-18', dayLabel: 'Fri', tokens: 0 },
        { date: '2026-04-19', dayLabel: 'Sat', tokens: 12_500 },
        { date: '2026-04-20', dayLabel: 'Sun', tokens: 300 },
        { date: '2026-04-21', dayLabel: 'Mon', tokens: 99 },
        { date: '2026-04-22', dayLabel: 'Tue', tokens: 7_654 }
      ],
      totalDictationTimeMs: 7_320_000,
      wordsDictated: 18_432,
      timeSavedMs: 4_500_000,
      avgDictationSpeedWpm: 142,
      completedDictations: 128,
      activeDays: 23
    }
    historyStatsQueryState = {
      data: historyStats,
      isLoading: false,
      isError: false
    }
    lastBarChartData = undefined
    lastXAxisDataKey = undefined
    lastBarDataKey = undefined
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

  test('renders dashboard metrics from history stats query data', async () => {
    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expect(screen.getByText('Daily Token Usage')).toBeTruthy()
    expect(screen.getByText('Daily LLM token consumption over the last 7 days.')).toBeTruthy()
    expect(screen.getByText('This chart shows the number of LLM tokens consumed each day.')).toBeTruthy()
    expectSummaryRow('Total Dictation Time', '2h 2m')
    expectSummaryRow('Words Dictated', '18,432')
    expectSummaryRow('Time Saved', '1h 15m')
    expectSummaryRow('Avg Dictation Speed', '142 wpm')
    expectSummaryRow('Completed Dictations', '128')
    expectSummaryRow('Active Days', '23')
    expect(screen.getByTestId('bar-chart')).toBeTruthy()
    expect(lastBarChartData).toBe(historyStats.dailyTokenUsage)
    expect(lastXAxisDataKey).toBe('dayLabel')
    expect(lastBarDataKey).toBe('tokens')
  })

  test('renders zeroed dashboard metrics for empty stats', async () => {
    historyStats = {
      dailyTokenUsage: [
        { date: '2026-04-16', dayLabel: 'Wed', tokens: 0 },
        { date: '2026-04-17', dayLabel: 'Thu', tokens: 0 },
        { date: '2026-04-18', dayLabel: 'Fri', tokens: 0 },
        { date: '2026-04-19', dayLabel: 'Sat', tokens: 0 },
        { date: '2026-04-20', dayLabel: 'Sun', tokens: 0 },
        { date: '2026-04-21', dayLabel: 'Mon', tokens: 0 },
        { date: '2026-04-22', dayLabel: 'Tue', tokens: 0 }
      ],
      totalDictationTimeMs: 0,
      wordsDictated: 0,
      timeSavedMs: 0,
      avgDictationSpeedWpm: 0,
      completedDictations: 0,
      activeDays: 0
    }
    historyStatsQueryState = {
      data: historyStats,
      isLoading: false,
      isError: false
    }

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expectSummaryRow('Total Dictation Time', '0m')
    expectSummaryRow('Words Dictated', '0')
    expectSummaryRow('Time Saved', '0m')
    expectSummaryRow('Avg Dictation Speed', '0 wpm')
    expectSummaryRow('Completed Dictations', '0')
    expectSummaryRow('Active Days', '0')
  })

  test('rounds non-zero under-one-minute durations up to 1m', async () => {
    historyStats = {
      ...historyStats,
      totalDictationTimeMs: 15_000,
      timeSavedMs: 45_000
    }
    historyStatsQueryState = {
      data: historyStats,
      isLoading: false,
      isError: false
    }

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expectSummaryRow('Total Dictation Time', '1m')
    expectSummaryRow('Time Saved', '1m')
  })

  test('shows stats loading state instead of implying zero values', async () => {
    historyStatsQueryState = {
      data: undefined,
      isLoading: true,
      isError: false
    }

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expectSummaryRow('Total Dictation Time', 'Loading...')
    expectSummaryRow('Words Dictated', 'Loading...')
    expect(screen.getByText('Loading stats...')).toBeTruthy()
    expect(screen.queryByText('0 wpm')).toBeNull()
    expect(screen.queryByTestId('bar-chart')).toBeNull()
  })

  test('shows stats error state instead of implying zero values', async () => {
    historyStatsQueryState = {
      data: undefined,
      isLoading: false,
      isError: true
    }

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expectSummaryRow('Total Dictation Time', 'Failed to load')
    expectSummaryRow('Words Dictated', 'Failed to load')
    expect(screen.getByText('Failed to load stats.')).toBeTruthy()
    expect(screen.queryByText('0m')).toBeNull()
    expect(screen.queryByTestId('bar-chart')).toBeNull()
  })

  test('keeps rendering stats when cached data exists during a refetch error', async () => {
    historyStatsQueryState = {
      data: historyStats,
      isLoading: false,
      isError: true
    }

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expectSummaryRow('Total Dictation Time', '2h 2m')
    expectSummaryRow('Words Dictated', '18,432')
    expect(screen.getByTestId('bar-chart')).toBeTruthy()
    expect(lastBarChartData).toBe(historyStats.dailyTokenUsage)
    expect(screen.queryByText('Failed to load stats.')).toBeNull()
    expect(screen.queryByText('Failed to load')).toBeNull()
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
    expectSummaryRow('Instruction Prompt Applied', 'Yes')
    expectSummaryRow('Ownership Matched At Delivery', 'Yes')
    expectSummaryRow('Delivery Method', 'paste')
    expectSummaryRow('Delivery Outcome', 'paste-success')
    expectSummaryRow('Paste Attempted', 'Yes')
    expectSummaryRow('Auto Send Triggered', 'Yes')
    expectSummaryRow('Fallback Reason', 'None')
    expectSummaryRow('Matched Instruction', 'Chat')
    expectSummaryRow('Frontmost App At Capture', 'Slack')
    expectSummaryRow('Target App At Match', 'ChatGPT')
    expectSummaryRow('Target App At Delivery', 'ChatGPT')
    const audio = screen.getByLabelText('History audio playback')
    expect(audio.getAttribute('src')).toBe('openbroca-media://history/record-1')
  })

  test('copies the full debug record as formatted json', async () => {
    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    fireEvent.click(screen.getByRole('button', { name: /show history details/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy debug json/i }))

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      JSON.stringify(selectedHistoryRecord, null, 2)
    )
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

  test('keeps failed records visible when debug mode is off, but still hides processing and empty completed records', async () => {
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

    expect(screen.getAllByRole('button', { name: /show history details/i })).toHaveLength(2)
    expect(screen.getByText('LLM failed: upstream 500')).toBeTruthy()
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
    expect(screen.getByText('LLM failed: upstream 500')).toBeTruthy()
    expect(screen.getByText('Processing...')).toBeTruthy()
  })

  test('filters history with tabs and styles failed previews in red', async () => {
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
      }
    ]

    const { Dashboard } = await import('../dashboard')
    render(<Dashboard />)

    expect(screen.getByRole('tab', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Successful' })).toBeTruthy()
    expect(screen.getByText('LLM failed: upstream 500')).toBeTruthy()
    expect(screen.getByText('LLM failed: upstream 500').className).toContain('text-destructive')

    fireEvent.click(screen.getByRole('tab', { name: 'Successful' }))

    expect(screen.queryByText('LLM failed: upstream 500')).toBeNull()
    expect(screen.getByText('Send the report by Friday.')).toBeTruthy()
  })
})
