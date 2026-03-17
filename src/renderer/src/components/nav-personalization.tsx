'use client'

import { Book02Icon, Plant01Icon, Relieved02Icon } from '@hugeicons/core-free-icons'
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
    name: 'Dictionary',
    url: '#',
    icon: <HugeiconsIcon icon={Book02Icon} strokeWidth={2} />
  },
  {
    name: 'Skills',
    url: '#',
    icon: <HugeiconsIcon icon={Plant01Icon} strokeWidth={2} />
  },
  {
    name: 'About Me',
    url: '#',
    icon: <HugeiconsIcon icon={Relieved02Icon} strokeWidth={2} />
  }
]

export function NavPersonalization() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Personalization</SidebarGroupLabel>
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
