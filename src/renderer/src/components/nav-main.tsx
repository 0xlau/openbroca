import { Button } from '@renderer/components/ui/button'
import { SidebarNavLink } from '@renderer/components/sidebar-nav-link'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, DashboardSquare01Icon, Mic01Icon } from '@hugeicons/core-free-icons'
import { NavItem } from '@renderer/types/nav'

const navItems: NavItem[] = [
  {
    name: 'Dashboard',
    url: '/',
    icon: <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
  }
]

export function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <HugeiconsIcon icon={Mic01Icon} strokeWidth={2} />
              <span>Choose Microphone</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
              <span className="sr-only">Inbox</span>
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
