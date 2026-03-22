import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode, ReactElement } from 'react'
import { trpc } from './trpc'
import { ipcLink } from './client'

const queryClient = new QueryClient()
const trpcClient = trpc.createClient({ links: [ipcLink()] })

export function TRPCProvider({ children }: { children: ReactNode }): ReactElement {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
