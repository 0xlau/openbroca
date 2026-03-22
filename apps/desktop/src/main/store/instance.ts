import Store from 'electron-store'
import type { StoreSchema } from './schema'

export const store = new Store<StoreSchema>({
  name: 'openbroca',
  defaults: {
    providers: {},
    settings: {}
  }
})
