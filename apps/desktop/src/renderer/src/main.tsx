import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './components/theme-provider'
import { TooltipProvider } from '@openbroca/ui'
import { RouterProvider } from 'react-router/dom'
import { router } from './router'
import { TRPCProvider } from './trpc'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TRPCProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </TRPCProvider>
    </ThemeProvider>
  </StrictMode>
)
