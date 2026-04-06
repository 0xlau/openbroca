import { AboutMe } from '@renderer/pages/main/about-me'
import { Dashboard } from '@renderer/pages/main/dashboard'
import { Dictionary } from '@renderer/pages/main/dictionary'
import { Brocas } from '@renderer/pages/main/brocas'
import { Instructions } from '@renderer/pages/main/instructions'
import { Providers } from '@renderer/pages/main/providers'
import { MainRoot } from '@renderer/pages/main/main-root'
import { FloatListening } from '@renderer/pages/float/float-listening'
import { createHashRouter } from 'react-router'

export const router = createHashRouter([
  {
    path: '/',
    element: <MainRoot />,
    children: [
      { index: true, Component: Dashboard },
      { path: 'providers', Component: Providers },
      { path: 'brocas', Component: Brocas },
      { path: 'instructions', Component: Instructions },
      { path: 'dictionary', Component: Dictionary },
      { path: 'about-me', Component: AboutMe }
    ]
  },
  {
    path: '/float/listening',
    element: <FloatListening />
  }
])
