# Dashboard Real Stats Design

**Date:** 2026-04-22

## Goal

Replace the placeholder dashboard metrics with values derived from the desktop app's real local voice history data.

The scope is limited to these existing dashboard cards and chart in [`dashboard.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/renderer/src/pages/main/dashboard.tsx):

- `Daily Token Usage`
- `Total Dictation Time`
- `Words Dictated`
- `Time Saved`
- `Avg Dictation Speed`

The page layout, chart type, and card structure remain unchanged. This work only replaces fake values with real aggregates.

## Confirmed Product Decisions

The user confirmed these rules for the first real-data version:

- data source is local voice history only, not provider billing or remote usage APIs
- `Daily Token Usage` uses the last 7 local natural days
- missing days in the 7-day window render as `0`
- `Daily Token Usage` includes any record with `debug.tokenUsage.totalTokens`
- the other four stats only include records where:
  - `status === 'completed'`
  - `finalText` is meaningful text
- `Time Saved` is estimated with a manual typing baseline of `40 wpm`
- day bucketing uses the machine's local timezone

## Current State

The dashboard currently hardcodes both the bar-chart data and the four stat cards in [`dashboard.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/renderer/src/pages/main/dashboard.tsx).

The desktop app already has the real underlying data in local history records:

- `createdAt`
- `status`
- `audioDurationMs`
- `finalText`
- `debug.tokenUsage.totalTokens`

Those records live in the main-process history repository and are exposed through the existing `history` tRPC router.

## Decision Summary

Add a dedicated `history.stats` query in the main-process tRPC router and keep aggregation logic out of the renderer.

Why this is the chosen boundary:

- the dashboard stats are a derived analytics view, not part of the history-row summary model
- the renderer should not need to understand record filtering, token aggregation, timezone bucketing, or text-derived metrics
- future dashboard metrics can extend one stats payload without bloating `history.list`

## Architecture

### 1. Main-process aggregation

Add a new stats aggregation path next to the existing history router.

The main process will:

- read `ctx.historyRepository.list()`
- derive one normalized stats payload for the dashboard
- return raw numeric values plus 7-day chart buckets

The aggregation stays close to the history domain and can reuse existing record shapes without exposing extra debug fields to the list view.

### 2. Renderer display

[`dashboard.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/renderer/src/pages/main/dashboard.tsx) will:

- call `trpc.history.stats.useQuery()`
- feed the returned chart array into the existing bar chart
- format the returned numeric values for display

No layout changes are planned. The renderer remains responsible only for presentation formatting such as `xh ym`, thousands separators, and `wpm`.

## Data Contract

The new query returns one dashboard-specific payload:

```ts
{
  dailyTokenUsage: Array<{
    date: string
    dayLabel: string
    tokens: number
  }>
  totalDictationTimeMs: number
  wordsDictated: number
  timeSavedMs: number
  avgDictationSpeedWpm: number
}
```

Field rules:

- `date` is a stable local-date key for each bucket
- `dayLabel` is the short chart label shown to the user
- `tokens` is the sum of `debug.tokenUsage.totalTokens` for that day
- `totalDictationTimeMs` is summed from eligible completed records
- `wordsDictated` is summed from eligible completed records
- `timeSavedMs` is derived from `wordsDictated / 40 wpm`
- `avgDictationSpeedWpm` is derived from total words divided by total dictated minutes

## Aggregation Rules

### Daily Token Usage

Source records:

- include records whose `debug.tokenUsage.totalTokens` is a finite non-negative number

Bucketing:

- build a 7-day window ending today in local time
- bucket by local calendar date derived from `createdAt`
- sum `totalTokens` per day
- emit all 7 days in order, filling missing dates with `0`

### Eligible dictation records

The remaining four stats use a stricter filter:

- `status === 'completed'`
- `finalText` passes the shared meaningful-text check already used on the dashboard history list

This avoids counting failed items, processing items, or empty cleanup output.

### Total Dictation Time

- sum `audioDurationMs` across eligible dictation records

### Words Dictated

- count words from each eligible `finalText`
- use one shared text-to-word-count helper so tests can lock the behavior
- word counting should normalize surrounding whitespace before splitting

### Time Saved

- estimate manual typing time from the total word count
- formula: `wordsDictated / 40 * 60_000`

### Avg Dictation Speed

- formula: `wordsDictated / totalDictationMinutes`
- if total dictated time is `0`, return `0`
- renderer displays the rounded whole-number `wpm`

## Formatting And Empty States

Renderer formatting rules:

- duration cards show `0m`, `Xm`, or `Xh Ym`
- `Words Dictated` uses locale thousands separators
- `Avg Dictation Speed` shows `0 wpm` when no eligible data exists

Empty history behavior:

- the chart still renders 7 buckets with `0`
- all cards render zero values
- no loading or error behavior changes beyond the existing query handling pattern

## Files To Change

Expected implementation surface:

- [`apps/desktop/src/main/trpc/routers/history.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/main/trpc/routers/history.ts)
- [`apps/desktop/src/renderer/src/pages/main/dashboard.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/renderer/src/pages/main/dashboard.tsx)
- [`apps/desktop/src/main/trpc/routers/__tests__/history.test.ts`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/main/trpc/routers/__tests__/history.test.ts)
- [`apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx`](/Users/liupeiqiang/Studio/OpenSource/openbroca/.worktrees/feat-dashboard-real-stats/apps/desktop/src/renderer/src/pages/main/__tests__/dashboard.test.tsx)

If a tiny shared helper is needed for formatting or word counting, it should stay narrowly scoped to this dashboard/history domain and not trigger a wider refactor.

## Testing

Main-process tests should cover:

- 7-day token window includes zero-filled gaps
- tokens outside the 7-day window are excluded
- records without token usage do not affect the token chart
- only completed meaningful-text records affect time, words, speed, and time saved
- zero-duration eligible data returns `0` average speed instead of dividing by zero

Renderer tests should cover:

- the dashboard renders real values from `history.stats`
- the chart consumes the stats payload instead of placeholder constants
- empty stats render zero values without crashing

## Risks And Non-Goals

Known implementation risk:

- Vitest in the current repo state already trips unrelated failures in `prompts.test.tsx`, so dashboard verification must stay targeted and those failures must be called out separately.

Non-goals for this change:

- remote provider usage reconciliation
- per-provider breakdowns
- configurable date ranges
- changing dashboard layout or card order
- backfilling historical records that lack token usage
