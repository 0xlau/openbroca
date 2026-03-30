// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@renderer/trpc', () => ({
  trpc: {
    app: {
      getAppVersion: {
        useQuery: () => ({ data: '1.0.0' })
      }
    }
  }
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
  TypographyMuted: ({ children }: { children: ReactNode }) => <p>{children}</p>,
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
  test('constrains and centers the page content', async () => {
    const { Dashboard } = await import('../dashboard')

    const { container } = render(<Dashboard />)

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })
})
