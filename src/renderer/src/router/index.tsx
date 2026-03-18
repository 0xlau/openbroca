import { Dashboard } from '@renderer/pages/dashboard'
import { Root } from '@renderer/pages/root'
import { createHashRouter } from 'react-router'

export const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    children: [{ index: true, Component: Dashboard }]
  }
])
