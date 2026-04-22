'use client'

import { Blockchain01Icon, KeyboardIcon, TextSelectIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarNavLink } from '@renderer/components/sidebar-nav-link'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@openbroca/ui'
import { NavItem } from '@renderer/types/nav'

const navItems: NavItem[] = [
  {
    name: 'Shortcuts',
    url: '/shortcuts',
    icon: <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
  },
  {
    name: 'Providers',
    url: '/providers',
    icon: <HugeiconsIcon icon={Blockchain01Icon} strokeWidth={2} />
  },
  {
    name: 'Prompts',
    url: '/prompts',
    icon: <HugeiconsIcon icon={TextSelectIcon} strokeWidth={2} />
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
