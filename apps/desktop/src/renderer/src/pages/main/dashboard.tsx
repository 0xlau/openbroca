import React from 'react'
import { DebugDialogs } from '@renderer/components/dialogs/debug-dialogs'
import { HistoryRow } from '@renderer/components/history/history-row'
import { trpc } from '@renderer/trpc'
import { hasMeaningfulText } from '../../../../shared/meaningful-text'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Kbd,
  KbdGroup,
  Separator,
  TypographyH1,
  TypographyLarge,
  TypographyMuted
} from '@openbroca/ui'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { useStore } from 'zustand'
import { settingsStore } from '@renderer/stores/settings-store'

const tokenUsageData = [
  { day: 'Mon', tokens: 4200 },
  { day: 'Tue', tokens: 6800 },
  { day: 'Wed', tokens: 3100 },
  { day: 'Thu', tokens: 8500 },
  { day: 'Fri', tokens: 7200 },
  { day: 'Sat', tokens: 2300 },
  { day: 'Sun', tokens: 5100 }
]

const chartConfig = {
  tokens: {
    label: 'Tokens',
    color: 'var(--primary)'
  }
} satisfies ChartConfig

const statsData = [
  { label: 'Total Dictation Time', value: '3h 42m' },
  { label: 'Words Dictated', value: '18,432' },
  { label: 'Time Saved', value: '1h 15m' },
  { label: 'Avg Dictation Speed', value: '142 wpm' }
]

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
      <TypographyMuted>{label}</TypographyMuted>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  )
}

export const Dashboard: React.FC = () => {
  const settings = useStore(settingsStore, (state) => state.data)
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<string | null>(null)

  const { data: appVersion } = trpc.app.getAppVersion.useQuery()
  const historyListQuery = trpc.history.list.useQuery()
  const selectedDetailQuery = trpc.history.getById.useQuery(
    { id: selectedHistoryId ?? '' },
    { enabled: selectedHistoryId !== null }
  )

  const historyItems = (historyListQuery.data ?? []).filter(
    (item) => settings.debugMode || hasMeaningfulText(item.finalText)
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
            Press{' '}
            <KbdGroup>
              <Kbd>Fn</Kbd>
            </KbdGroup>{' '}
            to start and stop dictation. Or hold to say something short.
            {appVersion && ` · v${appVersion}`}
          </TypographyMuted>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex flex-1 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
          <TypographyLarge>Daily Token Usage</TypographyLarge>
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <BarChart data={tokenUsageData}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="tokens" fill="var(--color-tokens)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-4">
          {statsData.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <div className="px-1">
          <TypographyLarge>History</TypographyLarge>
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
