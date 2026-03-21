'use client'

import { Book02Icon, Plant01Icon, Relieved02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarNavLink } from '@renderer/components/sidebar-nav-link'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@renderer/components/ui/sidebar'
import { NavItem } from '@renderer/types/nav'

const navItems: NavItem[] = [
  {
    name: 'Dictionary',
    url: '/dictionary',
    icon: <HugeiconsIcon icon={Book02Icon} strokeWidth={2} />
  },
  {
    name: 'Skills',
    url: '/skills',
    icon: <HugeiconsIcon icon={Plant01Icon} strokeWidth={2} />
  },
  {
    name: 'About Me',
    url: '/about-me',
    icon: <HugeiconsIcon icon={Relieved02Icon} strokeWidth={2} />
  }
]

export function NavPersonalization() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Personalization</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map((item) => (
          <SidebarNavLink key={item.name} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
