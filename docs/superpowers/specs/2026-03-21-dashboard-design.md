# Dashboard Page Design

**Date:** 2026-03-21
**File:** `src/renderer/src/pages/dashboard.tsx`

## Overview

A usage dashboard for the Openbroca desktop dictation app. Displays daily token usage, aggregate stats, and dictation history.

## Layout

Three vertical sections inside the standard `flex flex-col gap-6 p-6` page wrapper:

### Header
- `TypographyH3`: "Speak naturally, write perfectly – in any app"
- `TypographyMuted`: "Press Fn to start and stop dictation. Or hold to say something short."

### Middle — Chart Area (`flex gap-6`)
- **Left (flex-1):** Bar chart inside `rounded-xl ring-1 ring-foreground/10 p-4`. Uses shadcn `ChartContainer` + Recharts `BarChart`. X-axis = day labels (Mon–Sun), Y-axis = token count (formatted as `Xk`). 7-day mock data.
- **Right (flex-1):** `grid grid-cols-2 gap-4` with four `StatCard` components: Total Dictation Time, Words Dictated, Time Saved, Avg Dictation Speed. Each card uses `rounded-xl ring-1 ring-foreground/10 p-4`.

### Footer — History
- `TypographyLarge` section title.
- List container: `rounded-xl ring-1 ring-foreground/10` — matches `ProviderSection` pattern.
- Each row: date/time (`TypographyMuted`, fixed `w-36`) + sentence (`TypographySmall font-normal`), separated by `<Separator />`. 10 mock entries, newest-first.

## Data

All data is static mock data defined at module level. No real data wiring.

## Components Used

- shadcn: `Separator`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`
- Typography: `TypographyH3`, `TypographyLarge`, `TypographySmall`, `TypographyMuted`
- Recharts: `BarChart`, `Bar`, `XAxis`, `YAxis`
