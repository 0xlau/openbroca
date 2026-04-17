'use client'

import { Blockchain01Icon, CursorInWindowIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarNavLink } from '@renderer/components/sidebar-nav-link'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@openbroca/ui'
import { NavItem } from '@renderer/types/nav'

const navItems: NavItem[] = [
  {
    name: 'Providers',
    url: '/providers',
    icon: <HugeiconsIcon icon={Blockchain01Icon} strokeWidth={2} />
  },
  {
    name: 'Prompts',
    url: '/prompts',
    icon: <HugeiconsIcon icon={CursorInWindowIcon} strokeWidth={2} />
  }
]

export function NavSettings() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Settings</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map((item) => (
          <SidebarNavLink key={item.name} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
