import { AboutMe } from '@renderer/pages/about-me'
import { Dashboard } from '@renderer/pages/dashboard'
import { Dictionary } from '@renderer/pages/dictionary'
import { Brocas } from '@renderer/pages/brocas'
import { Providers } from '@renderer/pages/providers'
import { Root } from '@renderer/pages/root'
import { Skills } from '@renderer/pages/skills'
import { createHashRouter } from 'react-router'

export const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, Component: Dashboard },
      { path: 'providers', Component: Providers },
      { path: 'brocas', Component: Brocas },
      { path: 'dictionary', Component: Dictionary },
      { path: 'skills', Component: Skills },
      { path: 'about-me', Component: AboutMe }
    ]
  }
])
