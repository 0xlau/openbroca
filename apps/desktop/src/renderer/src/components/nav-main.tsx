import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@openbroca/ui'
import { SidebarNavLink } from '@renderer/components/sidebar-nav-link'
import { HugeiconsIcon } from '@hugeicons/react'
import { DashboardSquare01Icon, Mic01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { NavItem } from '@renderer/types/nav'
import { useMicrophones } from '@renderer/hooks/use-microphones'
import { microphoneStore } from '@renderer/stores/microphone-store'
import { useStore } from 'zustand'

const navItems: NavItem[] = [
  {
    name: 'Dashboard',
    url: '/',
    icon: <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
  }
]

export function NavMain() {
  const { microphones, refresh } = useMicrophones()
  const { data, update } = useStore(microphoneStore)

  const selectedMic = microphones.find((m) => m.deviceId === data.selectedDeviceId)
  const label = selectedMic?.label || 'Choose Microphone'

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip="Choose Microphone"
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <HugeiconsIcon icon={Mic01Icon} strokeWidth={2} />
                  <span className="truncate">{label}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-64">
                <DropdownMenuRadioGroup
                  value={data.selectedDeviceId ?? ''}
                  onValueChange={(deviceId) => update({ selectedDeviceId: deviceId || null })}
                >
                  {microphones.map((mic) => (
                    <DropdownMenuRadioItem key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone (${mic.deviceId.slice(0, 8)})`}
                    </DropdownMenuRadioItem>
                  ))}
                  {microphones.length === 0 && (
                    <DropdownMenuItem disabled>No microphones found</DropdownMenuItem>
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              className="group-data-[collapsible=icon]:opacity-0"
              variant="outline"
              onClick={refresh}
            >
              <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
              <span className="sr-only">Refresh</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarNavLink key={item.name} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
