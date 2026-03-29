import { ElectronAPI } from '@electron-toolkit/preload'
import type { ProviderAuthState } from '../shared/provider-auth'
import type { ListeningSessionState } from '../shared/listening-session-state'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      windowControls: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      providerAuth: {
        connect: (providerId: string) => Promise<ProviderAuthState>
        disconnect: (providerId: string) => Promise<ProviderAuthState>
      }
      listeningSession: {
        getState: () => Promise<ListeningSessionState>
        onStateChange: (callback: (state: ListeningSessionState) => void) => () => void
      }
    }
    trpc: {
      request: (payload: {
        path: string
        input: unknown
        type?: 'query' | 'mutation'
      }) => Promise<unknown>
      subscriptionStart: (payload: { path: string; input: unknown }) => Promise<string>
      subscriptionStop: (id: string) => Promise<void>
      onSubscriptionData: (callback: (data: unknown) => void) => () => void
    }
  }
}
