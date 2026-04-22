# Dashboard Real Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's placeholder token/time/speed cards with real aggregates derived from local voice history records.

**Architecture:** Keep the stats boundary in the main-process `history` router by adding a dedicated `stats` query that aggregates the existing repository records into one renderer-facing payload. Then update the dashboard page to query that payload, format the returned numbers for display, and remove all placeholder chart/card constants without changing the existing layout or history-row behavior.

**Tech Stack:** Electron, TypeScript, React, TRPC, Vitest, Recharts, Zustand

---

## File Structure

### Modified Files

- `apps/desktop/src/main/trpc/routers/history.ts`
  Add the new `stats` query plus the small local aggregation helpers it needs for 7-day bucketing, word counting, and numeric derivation.
- `apps/desktop/src/main/trpc/routers/__tests__/history.test.ts`
  Add router-level tests that lock the aggregation rules and empty-state behavior.
- `apps/desktop/src/renderer/src/pages/main/dashboard.tsx`
  Replace placeholder chart/card constants with `trpc.history.stats.useQuery()` and local formatting helpers.
- `apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx`
  Update the TRPC mock shape and assert the rendered chart/card values come from real stats data.

### No New Runtime Files

Keep this change scoped. Do not introduce a new stats service or utility module unless the existing files become unreadable during implementation.

## Task 1: Add The Main-Process `history.stats` Query

**Files:**
- Modify: `apps/desktop/src/main/trpc/routers/history.ts`
- Modify: `apps/desktop/src/main/trpc/routers/__tests__/history.test.ts`

- [ ] **Step 1: Write the failing router tests for stats aggregation**

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { historyRouter } from '../history'

describe('historyRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('returns 7-day token usage with zero-filled gaps and aggregate dictation stats', async () => {
    type HistoryCallerContext = Parameters<typeof historyRouter.createCaller>[0]

    const caller = historyRouter.createCaller({
      historyRepository: {
        list: () => [
          {
            id: 'record-complete-1',
            createdAt: '2026-04-22T10:00:00.000Z',
            updatedAt: '2026-04-22T10:00:00.000Z',
            status: 'completed',
            audioDurationMs: 120000,
            finalText: 'Send the report by Friday.',
            failureStage: null,
            debug: {
              rawTranscriptionText: '',
              asrSegments: [],
              asrRequest: {},
              asrResponseSummary: {},
              llmRequest: {},
              llmResponseSummary: {},
              tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
              delivery: {
                targetAppAtMatch: null,
                targetAppAtDelivery: null,
                matchedInstruction: null,
                instructionPromptApplied: false,
                ownershipMatchedAtDelivery: false,
                method: 'pending',
                status: 'pending',
                outcome: 'pending',
                pasteAttempted: false,
                autoSendTriggered: false
              },
              timeline: [],
              errors: []
            }
          },
          {
            id: 'record-complete-2',
            createdAt: '2026-04-20T10:00:00.000Z',
            updatedAt: '2026-04-20T10:00:00.000Z',
            status: 'completed',
            audioDurationMs: 180000,
            finalText: 'Plan launch checklist now',
            failureStage: null,
            debug: {
              rawTranscriptionText: '',
              asrSegments: [],
              asrRequest: {},
              asrResponseSummary: {},
              llmRequest: {},
              llmResponseSummary: {},
              tokenUsage: { promptTokens: 7, completionTokens: 8, totalTokens: 15 },
              delivery: {
                targetAppAtMatch: null,
                targetAppAtDelivery: null,
                matchedInstruction: null,
                instructionPromptApplied: false,
                ownershipMatchedAtDelivery: false,
                method: 'pending',
                status: 'pending',
                outcome: 'pending',
                pasteAttempted: false,
                autoSendTriggered: false
              },
              timeline: [],
              errors: []
            }
          },
          {
            id: 'record-failed',
            createdAt: '2026-04-21T10:00:00.000Z',
            updatedAt: '2026-04-21T10:00:00.000Z',
            status: 'failed',
            audioDurationMs: 999000,
            finalText: null,
            failureStage: 'llm',
            debug: {
              rawTranscriptionText: '',
              asrSegments: [],
              asrRequest: {},
              asrResponseSummary: {},
              llmRequest: {},
              llmResponseSummary: {},
              tokenUsage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
              delivery: {
                targetAppAtMatch: null,
                targetAppAtDelivery: null,
                matchedInstruction: null,
                instructionPromptApplied: false,
                ownershipMatchedAtDelivery: false,
                method: 'pending',
                status: 'pending',
                outcome: 'pending',
                pasteAttempted: false,
                autoSendTriggered: false
              },
              timeline: [],
              errors: []
            }
          }
        ]
      }
    } as unknown as HistoryCallerContext)

    await expect(caller.stats()).resolves.toMatchObject({
      dailyTokenUsage: expect.arrayContaining([
        expect.objectContaining({ tokens: 15 }),
        expect.objectContaining({ tokens: 5 }),
        expect.objectContaining({ tokens: 15 })
      ]),
      totalDictationTimeMs: 300000,
      wordsDictated: 8,
      timeSavedMs: 12000,
      avgDictationSpeedWpm: 96
    })
  })

  test('returns zeros when no eligible history records exist', async () => {
    type HistoryCallerContext = Parameters<typeof historyRouter.createCaller>[0]

    const caller = historyRouter.createCaller({
      historyRepository: {
        list: () => []
      }
    } as unknown as HistoryCallerContext)

    await expect(caller.stats()).resolves.toEqual({
      dailyTokenUsage: expect.arrayContaining(
        Array.from({ length: 7 }, () =>
          expect.objectContaining({
            tokens: 0
          })
        )
      ),
      totalDictationTimeMs: 0,
      wordsDictated: 0,
      timeSavedMs: 0,
      avgDictationSpeedWpm: 0
    })
  })
})
```

- [ ] **Step 2: Run the router test to verify `stats` does not exist yet**

Run: `pnpm --filter desktop test -- src/main/trpc/routers/__tests__/history.test.ts`
Expected: FAIL with a message similar to `Property 'stats' does not exist on type ...`

- [ ] **Step 3: Add the minimal stats aggregation to `history.ts`**

```ts
import { hasMeaningfulText } from '../../../shared/meaningful-text'

const DASHBOARD_TOKEN_WINDOW_DAYS = 7
const MANUAL_TYPING_WPM = 40

function toLocalDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }

  return trimmed.split(/\s+/).length
}

function buildDailyTokenUsage(records: Array<{ createdAt: string; debug: { tokenUsage?: { totalTokens: number } } }>) {
  const buckets = new Map<string, number>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = DASHBOARD_TOKEN_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(today)
    bucketDate.setDate(today.getDate() - offset)
    buckets.set(toLocalDateKey(bucketDate), 0)
  }

  for (const record of records) {
    const totalTokens = record.debug.tokenUsage?.totalTokens
    if (!Number.isFinite(totalTokens) || totalTokens == null || totalTokens < 0) {
      continue
    }

    const key = toLocalDateKey(record.createdAt)
    if (!buckets.has(key)) {
      continue
    }

    buckets.set(key, (buckets.get(key) ?? 0) + totalTokens)
  }

  return Array.from(buckets.entries()).map(([date, tokens]) => ({
    date,
    dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
    tokens
  }))
}

type HistoryStatsRecord = {
  createdAt: string
  status: string
  audioDurationMs: number
  finalText?: string
  debug: {
    tokenUsage?: {
      totalTokens: number
    }
  }
}

function toDashboardStats(records: HistoryStatsRecord[]) {
  const eligibleRecords = records.filter(
    (record) => record.status === 'completed' && hasMeaningfulText(record.finalText)
  )
  const totalDictationTimeMs = eligibleRecords.reduce((sum, record) => sum + record.audioDurationMs, 0)
  const wordsDictated = eligibleRecords.reduce((sum, record) => sum + countWords(record.finalText ?? ''), 0)
  const timeSavedMs = Math.round((wordsDictated / MANUAL_TYPING_WPM) * 60_000)
  const avgDictationSpeedWpm =
    totalDictationTimeMs > 0 ? Math.round(wordsDictated / (totalDictationTimeMs / 60_000)) : 0

  return {
    dailyTokenUsage: buildDailyTokenUsage(records),
    totalDictationTimeMs,
    wordsDictated,
    timeSavedMs,
    avgDictationSpeedWpm
  }
}

export const historyRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.historyRepository.list().map((record) => toHistorySummaryViewModel(record))
  ),
  stats: publicProcedure.query(({ ctx }) => toDashboardStats(ctx.historyRepository.list())),
  getById: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const record = ctx.historyRepository.getById(input.id)
    if (!record) {
      return null
    }

    return {
      ...toHistorySummaryViewModel(record),
      debug: record.debug
    }
  })
})
```

- [ ] **Step 4: Run the router test again and make it pass**

Run: `pnpm --filter desktop test -- src/main/trpc/routers/__tests__/history.test.ts`
Expected: PASS with the new `stats` assertions green.

- [ ] **Step 5: Commit the router slice**

```bash
git add apps/desktop/src/main/trpc/routers/history.ts apps/desktop/src/main/trpc/routers/__tests__/history.test.ts
git commit -m "feat: add dashboard history stats query"
```

## Task 2: Switch The Dashboard UI To Real Stats Data

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/main/dashboard.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx`

- [ ] **Step 1: Add failing dashboard tests for the new stats cards**

```ts
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
        useQuery: () => ({
          data: {
            dailyTokenUsage: [
              { date: '2026-04-16', dayLabel: 'Wed', tokens: 0 },
              { date: '2026-04-17', dayLabel: 'Thu', tokens: 0 },
              { date: '2026-04-18', dayLabel: 'Fri', tokens: 0 },
              { date: '2026-04-19', dayLabel: 'Sat', tokens: 0 },
              { date: '2026-04-20', dayLabel: 'Sun', tokens: 15 },
              { date: '2026-04-21', dayLabel: 'Mon', tokens: 5 },
              { date: '2026-04-22', dayLabel: 'Tue', tokens: 15 }
            ],
            totalDictationTimeMs: 300000,
            wordsDictated: 8,
            timeSavedMs: 12000,
            avgDictationSpeedWpm: 96
          }
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

test('renders dashboard stat cards from history stats data', async () => {
  const { Dashboard } = await import('../dashboard')
  render(<Dashboard />)

  expectSummaryRow('Total Dictation Time', '5m')
  expectSummaryRow('Words Dictated', '8')
  expectSummaryRow('Time Saved', '0m')
  expectSummaryRow('Avg Dictation Speed', '96 wpm')
})
```

- [ ] **Step 2: Run the dashboard test to confirm the UI still uses placeholders**

Run: `pnpm --filter desktop test -- src/renderer/src/pages/main/__tests__/dashboard.test.tsx`
Expected: FAIL because the dashboard still renders `3h 42m`, `18,432`, `1h 15m`, and `142 wpm`.

- [ ] **Step 3: Replace placeholder data in `dashboard.tsx` with the real stats query**

```tsx
function formatDuration(durationMs: number): string {
  if (durationMs <= 0) {
    return '0m'
  }

  const totalMinutes = Math.round(durationMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${totalMinutes}m`
  }

  return `${hours}h ${minutes}m`
}

function formatWords(count: number): string {
  return count.toLocaleString()
}

function formatSpeed(wpm: number): string {
  return `${Math.round(wpm)} wpm`
}

export const Dashboard: React.FC = () => {
  const settings = useStore(settingsStore, (state) => state.data)
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<string | null>(null)

  const { data: appVersion } = trpc.app.getAppVersion.useQuery()
  const historyListQuery = trpc.history.list.useQuery()
  const historyStatsQuery = trpc.history.stats.useQuery()
  const selectedDetailQuery = trpc.history.getById.useQuery(
    { id: selectedHistoryId ?? '' },
    { enabled: selectedHistoryId !== null }
  )

  const historyStats = historyStatsQuery.data ?? {
    dailyTokenUsage: [],
    totalDictationTimeMs: 0,
    wordsDictated: 0,
    timeSavedMs: 0,
    avgDictationSpeedWpm: 0
  }

  const statsData = [
    { label: 'Total Dictation Time', value: formatDuration(historyStats.totalDictationTimeMs) },
    { label: 'Words Dictated', value: formatWords(historyStats.wordsDictated) },
    { label: 'Time Saved', value: formatDuration(historyStats.timeSavedMs) },
    { label: 'Avg Dictation Speed', value: formatSpeed(historyStats.avgDictationSpeedWpm) }
  ]

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex gap-6">
        <div className="flex flex-1 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
          <TypographyLarge>Daily Token Usage</TypographyLarge>
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <BarChart data={historyStats.dailyTokenUsage}>
              <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="tokens" fill="var(--color-tokens)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-4">
          {statsData.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Re-run the dashboard test and keep history dialog coverage green**

Run: `pnpm --filter desktop test -- src/renderer/src/pages/main/__tests__/dashboard.test.tsx`
Expected: PASS with the new stats-card assertion and the existing history-row/dialog assertions still green.

- [ ] **Step 5: Commit the renderer slice**

```bash
git add apps/desktop/src/renderer/src/pages/main/dashboard.tsx apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx
git commit -m "feat: render dashboard metrics from history stats"
```

## Task 3: Run Targeted Verification And Record The Existing Test Noise

**Files:**
- Verify: `apps/desktop/src/main/trpc/routers/__tests__/history.test.ts`
- Verify: `apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx`

- [ ] **Step 1: Run the exact targeted verification for the touched surface**

```bash
pnpm --filter desktop test -- src/main/trpc/routers/__tests__/history.test.ts src/renderer/src/pages/main/__tests__/dashboard.test.tsx
```

Expected: both touched test files PASS.

- [ ] **Step 2: Run one broader desktop spot-check and note the unrelated failure separately**

```bash
pnpm --filter desktop test -- src/main/trpc/routers/__tests__/history.test.ts
pnpm --filter desktop test -- src/renderer/src/pages/main/__tests__/dashboard.test.tsx
```

Expected: the touched files PASS, while broader desktop Vitest may still surface the pre-existing `prompts.test.tsx` failure described in the spec. Do not broaden the implementation scope to fix `Prompts`.

- [ ] **Step 3: Commit the finished feature branch state**

```bash
git add apps/desktop/src/main/trpc/routers/history.ts apps/desktop/src/main/trpc/routers/__tests__/history.test.ts apps/desktop/src/renderer/src/pages/main/dashboard.tsx apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx
git commit -m "feat: replace dashboard placeholder stats with real history aggregates"
```
