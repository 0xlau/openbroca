import { Outlet } from 'react-router'
import { AppSidebar } from '../components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@openbroca/ui'
import React from 'react'

export const Root: React.FC = () => {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)'
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
