import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

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
