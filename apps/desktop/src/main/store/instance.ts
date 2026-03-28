import ElectronStore from 'electron-store'
import type { StoreSchema } from './schema'

const Store: typeof ElectronStore =
  (ElectronStore as unknown as { default?: typeof ElectronStore }).default ?? ElectronStore

export const store = new Store<StoreSchema>({
  name: 'openbroca',
  defaults: {
    aboutMe: {},
    dictionary: {},
    providers: {},
    settings: {}
  }
})
