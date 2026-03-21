'use client'

import * as React from 'react'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@openbroca/ui'
import { NavItem } from '@renderer/types/nav'
import { HelpCircleIcon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const navItems: NavItem[] = [
  {
    name: 'Settings',
    url: '#',
    icon: <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
  },
  {
    name: 'Get Help',
    url: '#',
    icon: <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
  }
]

export function NavFooter({ ...props }: {} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton>
                {item.icon}
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
