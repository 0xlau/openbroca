import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ListeningSessionState } from '../shared/listening-session-state'
import type { ProviderAuthState } from '../shared/provider-auth'

// Custom APIs for renderer
const api = {
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  providerAuth: {
    connect: (providerId: string) =>
      ipcRenderer.invoke('provider-auth:connect', providerId) as Promise<ProviderAuthState>,
    disconnect: (providerId: string) =>
      ipcRenderer.invoke('provider-auth:disconnect', providerId) as Promise<ProviderAuthState>
  },
  listeningSession: {
    getState: () =>
      ipcRenderer.invoke('listening-session:get-state') as Promise<ListeningSessionState>,
    onStateChange: (callback: (state: ListeningSessionState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: ListeningSessionState) =>
        callback(state)

      ipcRenderer.on('listening-session:state-changed', handler)

      return () => {
        ipcRenderer.removeListener('listening-session:state-changed', handler)
      }
    }
  }
}

type SubscriptionDataCallback = (data: unknown) => void

const trpc = {
  request: (payload: { path: string; input: unknown }) =>
    ipcRenderer.invoke('trpc:request', payload),
  subscriptionStart: (payload: { path: string; input: unknown }) =>
    ipcRenderer.invoke('trpc:subscription:start', payload),
  subscriptionStop: (id: string) => ipcRenderer.invoke('trpc:subscription:stop', id),
  onSubscriptionData: (callback: SubscriptionDataCallback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('trpc:subscription:data', handler)
    return () => ipcRenderer.removeListener('trpc:subscription:data', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('trpc', trpc)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.trpc = trpc
}
