import type { BrowserWindow } from 'electron'

export interface Context {
  window: BrowserWindow
}

export function createContext(window: BrowserWindow): Context {
  return { window }
}
