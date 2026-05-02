import React from 'react'
import { DebugDialogs } from '@renderer/components/dialogs/debug-dialogs'
import { HistoryRow } from '@renderer/components/history/history-row'
import { trpc } from '@renderer/trpc'
import { hasMeaningfulText } from '../../../../shared/meaningful-text'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Kbd,
  KbdGroup,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TypographyH1,
  TypographyLarge,
  TypographyMuted
} from '@openbroca/ui'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { useStore } from 'zustand'
import { settingsStore } from '@renderer/stores/settings-store'
import { shortcutsStore } from '@renderer/stores/shortcuts-store'

const chartConfig = {
  tokens: {
    label: 'Tokens',
    color: 'var(--primary)'
  }
} satisfies ChartConfig

type HistoryStatsData = {
  dailyTokenUsage: Array<{
    date: string
    dayLabel: string
    tokens: number
  }>
  completedDictations: number
  activeDays: number
  totalDictationTimeMs: number
  wordsDictated: number
  timeSavedMs: number
  avgDictationSpeedWpm: number
}

const EMPTY_STATS: HistoryStatsData = {
  dailyTokenUsage: [],
  completedDictations: 0,
  activeDays: 0,
  totalDictationTimeMs: 0,
  wordsDictated: 0,
  timeSavedMs: 0,
  avgDictationSpeedWpm: 0
}

function formatDuration(ms: number) {
  if (ms <= 0) {
    return '0m'
  }

  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes === 0) {
    return '1m'
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

const SINGLE_MODIFIER_ACCELERATORS = new Set(['Command', 'Control', 'Option', 'Shift'])

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
      <TypographyMuted>{label}</TypographyMuted>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  )
}

function ShortcutHint({ accelerator }: { accelerator: string }) {
  return (
    <>
      {SINGLE_MODIFIER_ACCELERATORS.has(accelerator) ? 'Double Tap ' : null}
      <KbdGroup>
        {accelerator.split('+').map((token) => (
          <Kbd key={token}>{token}</Kbd>
        ))}
      </KbdGroup>
    </>
  )
}

export const Dashboard: React.FC = () => {
  const settings = useStore(settingsStore, (state) => state.data)
  const shortcuts = useStore(shortcutsStore, (state) => state.data)
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = React.useState<'all' | 'valid'>('all')

  const historyListQuery = trpc.history.list.useQuery()
  const historyStatsQuery = trpc.history.stats.useQuery()
  const selectedDetailQuery = trpc.history.getById.useQuery(
    { id: selectedHistoryId ?? '' },
    { enabled: selectedHistoryId !== null }
  )
  const hasStatsData = historyStatsQuery.data !== undefined
  const statsState = hasStatsData
    ? 'ready'
    : historyStatsQuery.isLoading
      ? 'loading'
      : historyStatsQuery.isError
        ? 'error'
        : 'ready'
  const stats = historyStatsQuery.data ?? EMPTY_STATS
  const statsData =
    statsState === 'ready'
      ? [
          { label: 'Completed Dictations', value: stats.completedDictations.toLocaleString() },
          { label: 'Active Days', value: stats.activeDays.toLocaleString() },
          { label: 'Total Dictation Time', value: formatDuration(stats.totalDictationTimeMs) },
          { label: 'Words Dictated', value: stats.wordsDictated.toLocaleString() },
          { label: 'Time Saved', value: formatDuration(stats.timeSavedMs) },
          { label: 'Avg Dictation Speed', value: `${stats.avgDictationSpeedWpm} wpm` }
        ]
      : [
          {
            label: 'Completed Dictations',
            value: statsState === 'loading' ? 'Loading...' : 'Failed to load'
          },
          {
            label: 'Active Days',
            value: statsState === 'loading' ? 'Loading...' : 'Failed to load'
          },
          {
            label: 'Total Dictation Time',
            value: statsState === 'loading' ? 'Loading...' : 'Failed to load'
          },
          {
            label: 'Words Dictated',
            value: statsState === 'loading' ? 'Loading...' : 'Failed to load'
          },
          {
            label: 'Time Saved',
            value: statsState === 'loading' ? 'Loading...' : 'Failed to load'
          },
          {
            label: 'Avg Dictation Speed',
            value: statsState === 'loading' ? 'Loading...' : 'Failed to load'
          }
        ]

  const baseHistoryItems = (historyListQuery.data ?? []).filter(
    (item) => settings.debugMode || item.status === 'failed' || hasMeaningfulText(item.finalText)
  )
  const historyItems = baseHistoryItems.filter(
    (item) => historyFilter === 'all' || item.status !== 'failed'
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <TypographyH1
            className="text-left font-extrabold tracking-normal text-5xl py-3"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Wake your Broca, let thoughts speak
          </TypographyH1>
          <TypographyMuted>
            <ShortcutHint accelerator={shortcuts.quickAccelerator} /> to start and stop
            dictation. Or <ShortcutHint accelerator={shortcuts.holdAccelerator} /> to say something
            short.
          </TypographyMuted>
        </div>
      </div>

      <div className="flex gap-6">
        <Card size="sm" className="flex flex-1 gap-0">
          <CardHeader className="border-b">
            <CardTitle>Daily Token Usage</CardTitle>
            <CardDescription>Daily LLM token consumption over the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ChartContainer config={chartConfig} className="h-48 w-full">
              {statsState === 'ready' ? (
                <BarChart accessibilityLayer data={stats.dailyTokenUsage}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="tokens" fill="var(--color-tokens)" radius={8} />
                </BarChart>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <TypographyMuted>
                    {statsState === 'loading' ? 'Loading stats...' : 'Failed to load stats.'}
                  </TypographyMuted>
                </div>
              )}
            </ChartContainer>
          </CardContent>
        </Card>

        <div className="flex-1 grid grid-cols-2 gap-4">
          {statsData.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <TypographyLarge>History</TypographyLarge>
          <Tabs value={historyFilter} onValueChange={(value) => setHistoryFilter(value as 'all' | 'valid')}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="valid">Successful</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          {historyListQuery.isLoading ? (
            <div className="px-4 py-3">
              <TypographyMuted>Loading history...</TypographyMuted>
            </div>
          ) : historyListQuery.isError ? (
            <div className="px-4 py-3">
              <TypographyMuted>Failed to load history.</TypographyMuted>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="px-4 py-3">
              <TypographyMuted>No history yet.</TypographyMuted>
            </div>
          ) : (
            historyItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <HistoryRow item={item} onOpenDetails={setSelectedHistoryId} />
                {index === historyItems.length - 1 ? null : <Separator />}
              </React.Fragment>
            ))
          )}
        </div>
      </section>
      <DebugDialogs
        open={selectedHistoryId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedHistoryId(null)
          }
        }}
        record={selectedDetailQuery.data ?? null}
        debugMode={settings.debugMode}
        isLoading={selectedHistoryId !== null && selectedDetailQuery.isLoading}
        isError={selectedHistoryId !== null && selectedDetailQuery.isError}
      />
    </div>
  )
}
