'use client'

import { Blockchain01Icon, Globe02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { NavItem } from '@renderer/types/nav'

const navItems: NavItem[] = [
  {
    name: 'Providers',
    url: '#',
    icon: <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} />
  },
  {
    name: 'Models',
    url: '#',
    icon: <HugeiconsIcon icon={Blockchain01Icon} strokeWidth={2} />
  }
]

export function NavServer() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Server</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              <a href={item.url}>
                {item.icon}
                <span>{item.name}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
