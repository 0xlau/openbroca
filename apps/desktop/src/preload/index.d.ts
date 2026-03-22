import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
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
