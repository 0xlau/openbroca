'use client'

import * as React from 'react'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from '@openbroca/ui'
import { NavItem } from '@renderer/types/nav'
import { HelpCircleIcon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isVisibleUpdateState } from '../../../shared/app-update'
import { useAppUpdate } from '@renderer/hooks/use-app-update'

const navItems: NavItem[] = [
  {
    name: 'Get Help',
    url: '#',
    icon: <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
  }
]

export function NavFooter({ ...props }: {} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { state: updateState, install } = useAppUpdate()
  const showUpdate = isVisibleUpdateState(updateState)
  const updateLabel = getUpdateLabel(updateState)
  const isUpdateBusy = updateState?.status === 'downloading' || updateState?.status === 'installing'

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
          {showUpdate && (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="pr-12"
                disabled={isUpdateBusy}
                tooltip={updateLabel}
                onClick={() => {
                  void install()
                }}
              >
                <HugeiconsIcon
                  icon={Refresh01Icon}
                  strokeWidth={2}
                  className={isUpdateBusy ? 'animate-spin' : undefined}
                />
                <span>{updateLabel}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="bg-primary text-primary-foreground">
                New
              </SidebarMenuBadge>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function getUpdateLabel(state: ReturnType<typeof useAppUpdate>['state']): string {
  if (state?.status === 'downloading') {
    return state.downloadProgress != null
      ? `Downloading ${state.downloadProgress}%`
      : 'Downloading update'
  }

  if (state?.status === 'downloaded') {
    return 'Restart to update'
  }

  if (state?.status === 'installing') {
    return 'Installing update'
  }

  if (state?.latestVersion) {
    return `Update to ${state.latestVersion}`
  }

  return 'Update available'
}
