import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { StoreSchema } from '../store'

export interface Context {
  window: BrowserWindow
  store: Store<StoreSchema>
}

export function createContext(window: BrowserWindow, store: Store<StoreSchema>): Context {
  return { window, store }
}
