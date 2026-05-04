import { ElectronAPI } from '@electron-toolkit/preload'
import type { OnboardingGateSnapshot } from '../main/onboarding-gate/types'
import type { ProviderAuthState } from '../shared/provider-auth'
import type { ListeningSessionBridgeState } from '../shared/listening-session-state'
import type { NotifyWindowBridgeState } from '../shared/notify-window-state'

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
      permissions: {
        getSnapshot: () => Promise<OnboardingGateSnapshot>
        requestMicrophone: () => Promise<OnboardingGateSnapshot>
        openDesktopControlSettings: () => Promise<OnboardingGateSnapshot>
        refresh: () => Promise<OnboardingGateSnapshot>
        quitApp: () => Promise<void>
        onStateChange: (callback: (snapshot: OnboardingGateSnapshot) => void) => () => void
      }
      listeningSession: {
        cancelCapture: () => Promise<void>
        cancelProcessing: () => Promise<void>
        finishCapture: () => Promise<void>
        getState: () => Promise<ListeningSessionBridgeState>
        onStateChange: (callback: (state: ListeningSessionBridgeState) => void) => () => void
      }
      notifyWindow: {
        getState: () => Promise<NotifyWindowBridgeState>
        onStateChange: (callback: (state: NotifyWindowBridgeState) => void) => () => void
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
