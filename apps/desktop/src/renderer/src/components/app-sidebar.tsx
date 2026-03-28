import * as React from 'react'

import { NavPersonalization } from '@renderer/components/nav-personalization'
import { NavMain } from '@renderer/components/nav-main'
import { NavSettings } from '@renderer/components/nav-server'
import { NavFooter } from '@renderer/components/nav-footer'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem
} from '@openbroca/ui'
import Logo from '@renderer/assets/logo.svg?react'
import { usePlatform } from '@renderer/hooks/use-platform'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMac } = usePlatform()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader
        style={isMac ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
        className={isMac ? 'pt-10' : undefined}
      >
        <SidebarMenu>
          <SidebarMenuItem style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <Logo className="h-10 px-2" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavPersonalization />
        <NavSettings />
      </SidebarContent>
      <SidebarFooter>
        <NavFooter className="m-0 p-0" />
      </SidebarFooter>
    </Sidebar>
  )
}
