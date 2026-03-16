import * as React from 'react'

import { NavDocuments } from '@renderer/components/nav-documents'
import { NavMain } from '@renderer/components/nav-main'
import { NavSecondary } from '@renderer/components/nav-secondary'
import { NavUser } from '@renderer/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DashboardSquare01Icon,
  Menu01Icon,
  ChartHistogramIcon,
  Folder01Icon,
  UserGroupIcon,
  Camera01Icon,
  File01Icon,
  Settings05Icon,
  HelpCircleIcon,
  SearchIcon,
  Database01Icon,
  Analytics01Icon
} from '@hugeicons/core-free-icons'
import Logo from '@renderer/assets/logo.svg?react'

const data = {
  user: {
    name: 'shadcn',
    email: 'm@example.com',
    avatar: '/avatars/shadcn.jpg'
  },
  navMain: [
    {
      title: 'Dashboard',
      url: '#',
      icon: <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
    },
    {
      title: 'Lifecycle',
      url: '#',
      icon: <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} />
    },
    {
      title: 'Analytics',
      url: '#',
      icon: <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={2} />
    },
    {
      title: 'Projects',
      url: '#',
      icon: <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
    },
    {
      title: 'Team',
      url: '#',
      icon: <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
    }
  ],
  navClouds: [
    {
      title: 'Capture',
      icon: <HugeiconsIcon icon={Camera01Icon} strokeWidth={2} />,
      isActive: true,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#'
        },
        {
          title: 'Archived',
          url: '#'
        }
      ]
    },
    {
      title: 'Proposal',
      icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#'
        },
        {
          title: 'Archived',
          url: '#'
        }
      ]
    },
    {
      title: 'Prompts',
      icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#'
        },
        {
          title: 'Archived',
          url: '#'
        }
      ]
    }
  ],
  navSecondary: [
    {
      title: 'Settings',
      url: '#',
      icon: <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />
    },
    {
      title: 'Get Help',
      url: '#',
      icon: <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
    },
    {
      title: 'Search',
      url: '#',
      icon: <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
    }
  ],
  documents: [
    {
      name: 'Data Library',
      url: '#',
      icon: <HugeiconsIcon icon={Database01Icon} strokeWidth={2} />
    },
    {
      name: 'Reports',
      url: '#',
      icon: <HugeiconsIcon icon={Analytics01Icon} strokeWidth={2} />
    },
    {
      name: 'Word Assistant',
      url: '#',
      icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
    }
  ]
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Logo className="h-10 px-2" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
