import { SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import { NavItem } from '@renderer/types/nav'
import { NavLink, useMatch, useResolvedPath } from 'react-router'

type SidebarNavLinkProps = {
  item: NavItem
}

export function SidebarNavLink({ item }: SidebarNavLinkProps) {
  const resolvedPath = useResolvedPath(item.url)
  const isActive = useMatch({ path: resolvedPath.pathname, end: item.url === '/' }) !== null

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <NavLink to={item.url} end={item.url === '/'}>
          {item.icon}
          <span>{item.name}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
