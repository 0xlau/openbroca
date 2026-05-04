import { AboutMe } from '@renderer/pages/main/about-me'
import { Dashboard } from '@renderer/pages/main/dashboard'
import { Dictionary } from '@renderer/pages/main/dictionary'
import { Brocas } from '@renderer/pages/main/brocas'
import { Instructions } from '@renderer/pages/main/instructions'
import { Providers } from '@renderer/pages/main/providers'
import { Prompts } from '@renderer/pages/main/prompts'
import { Shortcuts } from '@renderer/pages/main/shortcuts'
import { MainRoot } from '@renderer/pages/main/main-root'
import { FloatListening } from '@renderer/pages/float/float-listening'
import { NotifyWindow } from '@renderer/pages/notify/notify-window'
import { OnboardingShell } from '@renderer/pages/onboarding/shell'
import { PermissionsStep } from '@renderer/pages/onboarding/steps/permissions-step'
import { ProvidersStep } from '@renderer/pages/onboarding/steps/providers-step'
import { ShortcutsStep } from '@renderer/pages/onboarding/steps/shortcuts-step'
import { createHashRouter } from 'react-router'

export const router = createHashRouter([
  {
    path: '/',
    element: <MainRoot />,
    children: [
      { index: true, Component: Dashboard },
      { path: 'providers', Component: Providers },
      { path: 'prompts', Component: Prompts },
      { path: 'shortcuts', Component: Shortcuts },
      { path: 'brocas', Component: Brocas },
      { path: 'instructions', Component: Instructions },
      { path: 'dictionary', Component: Dictionary },
      { path: 'about-me', Component: AboutMe }
    ]
  },
  {
    path: '/float/listening',
    element: <FloatListening />
  },
  {
    path: '/notify/window',
    element: <NotifyWindow />
  },
  {
    path: '/onboarding',
    element: <OnboardingShell />,
    children: [
      { path: 'permissions', element: <PermissionsStep /> },
      { path: 'providers', element: <ProvidersStep /> },
      { path: 'shortcuts', element: <ShortcutsStep /> }
    ]
  }
])
