// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('react-router', () => ({
  Outlet: () => <div>Outlet Content</div>
}))

vi.mock('../../components/app-sidebar', () => ({
  AppSidebar: () => <aside>Sidebar</aside>
}))

vi.mock('@renderer/components/nav-personalization', () => ({
  NavPersonalization: () => <div>Personalization</div>
}))

vi.mock('@renderer/components/nav-main', () => ({
  NavMain: () => <div>Main Nav</div>
}))

vi.mock('@renderer/components/nav-settings', () => ({
  NavSettings: () => <div>Settings Nav</div>
}))

vi.mock('@renderer/components/nav-footer', () => ({
  NavFooter: () => <div>Footer Nav</div>
}))

vi.mock('@renderer/assets/logo.svg?react', () => ({
  default: () => <div>Logo</div>
}))

vi.mock('../../components/title-bar', () => ({
  WindowsTitleBar: () => <div>Title Bar</div>
}))

vi.mock('../../hooks/use-platform', () => ({
  usePlatform: () => ({ isWindows: false })
}))

vi.mock('@renderer/hooks/use-platform', () => ({
  usePlatform: () => ({ isWindows: false, isMac: false, isLinux: true })
}))

vi.mock('@openbroca/ui', () => ({
  Sidebar: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarProvider: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  SidebarInset: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => (
    <div data-testid="sidebar-inset" className={className}>
      {children}
    </div>
  )
}))

describe('MainRoot', () => {
  test('allows the main content area to scroll vertically', async () => {
    const { MainRoot } = await import('../main-root')

    render(<MainRoot />)

    expect(screen.getByTestId('sidebar-inset').className).toContain('overflow-y-auto')
  })
})
