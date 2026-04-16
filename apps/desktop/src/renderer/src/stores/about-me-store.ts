import { createPersistedStore } from './create-persisted-store'
import {
  defaultAboutMeSettings,
  type AboutMeSettings
} from '../../../shared/about-me'

export { defaultAboutMeSettings }
export type { AboutMeSettings }

export const aboutMeStore = createPersistedStore<AboutMeSettings>({
  key: 'aboutMe',
  defaults: defaultAboutMeSettings
})
