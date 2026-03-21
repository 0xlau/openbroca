import React from 'react'
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
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

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

const historyData = [
  {
    id: 1,
    datetime: '2026-03-21 14:32',
    text: 'Send the report to the team by end of day Friday.'
  },
  {
    id: 2,
    datetime: '2026-03-21 11:08',
    text: 'Schedule a meeting with the design team to review the new mockups.'
  },
  {
    id: 3,
    datetime: '2026-03-20 16:45',
    text: 'Follow up with John about the project timeline.'
  },
  {
    id: 4,
    datetime: '2026-03-20 10:22',
    text: 'Update the documentation for the API endpoints.'
  },
  {
    id: 5,
    datetime: '2026-03-19 15:13',
    text: 'Remind myself to check the analytics dashboard tomorrow morning.'
  },
  {
    id: 6,
    datetime: '2026-03-19 09:55',
    text: 'Draft an email to the client about the delay in delivery.'
  },
  {
    id: 7,
    datetime: '2026-03-18 17:30',
    text: 'Create a list of action items from the sprint retrospective.'
  },
  {
    id: 8,
    datetime: '2026-03-18 13:47',
    text: 'Look into the new voice recognition models available in the API.'
  },
  {
    id: 9,
    datetime: '2026-03-17 11:20',
    text: 'Prepare the slides for the quarterly business review.'
  },
  {
    id: 10,
    datetime: '2026-03-17 08:35',
    text: 'Add error handling to the file upload component.'
  }
]

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
      <TypographyMuted>{label}</TypographyMuted>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  )
}

function HistoryRow({ item, isLast }: { item: (typeof historyData)[number]; isLast: boolean }) {
  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3">
        <TypographyMuted className="w-36 shrink-0 pt-0.5">{item.datetime}</TypographyMuted>
        <TypographySmall className="flex-1 font-normal">{item.text}</TypographySmall>
      </div>
      {!isLast && <Separator />}
    </>
  )
}

export const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 p-6">
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
        </TypographyMuted>
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
          {historyData.map((item, index) => (
            <HistoryRow key={item.id} item={item} isLast={index === historyData.length - 1} />
          ))}
        </div>
      </section>
    </div>
  )
}
