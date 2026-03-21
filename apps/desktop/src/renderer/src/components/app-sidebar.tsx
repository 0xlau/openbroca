import * as React from 'react'

import { NavPersonalization } from '@renderer/components/nav-personalization'
import { NavMain } from '@renderer/components/nav-main'
import { NavServer } from '@renderer/components/nav-server'
import { NavFooter } from '@renderer/components/nav-footer'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import Logo from '@renderer/assets/logo.svg?react'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Logo className="h-10 px-2" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavPersonalization />
        <NavServer />
      </SidebarContent>
      <SidebarFooter>
        <NavFooter className="m-0 p-0" />
      </SidebarFooter>
    </Sidebar>
  )
}
