import * as React from 'react'

import { NavPersonalization } from '@renderer/components/nav-personalization'
import { NavMain } from '@renderer/components/nav-main'
import { NavSecondary } from '@renderer/components/nav-secondary'
import {
  Sidebar,
  SidebarContent,
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
        <NavSecondary className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
