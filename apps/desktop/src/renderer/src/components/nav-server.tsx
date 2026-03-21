'use client'

import { Blockchain01Icon, BrainIcon } from '@hugeicons/core-free-icons'
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
    name: 'Brocas',
    url: '/brocas',
    icon: <HugeiconsIcon icon={BrainIcon} strokeWidth={2} />
  }
]

export function NavServer() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Server</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map((item) => (
          <SidebarNavLink key={item.name} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
