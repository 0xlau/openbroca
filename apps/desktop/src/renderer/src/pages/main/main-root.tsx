import { Outlet } from 'react-router'
import { AppSidebar } from '../../components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@openbroca/ui'
import { WindowsTitleBar } from '../../components/title-bar'
import { usePlatform } from '../../hooks/use-platform'
import React from 'react'

export const MainRoot: React.FC = () => {
  const { isWindows } = usePlatform()

  return (
    <div className="flex h-screen flex-col">
      {isWindows && <WindowsTitleBar />}
      <SidebarProvider
        className="min-h-0 flex-1"
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)'
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-y-auto">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
