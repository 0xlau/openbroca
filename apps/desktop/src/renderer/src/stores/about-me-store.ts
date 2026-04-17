import { createPersistedStore } from './create-persisted-store'
import {
  defaultAboutMeSettings,
  normalizeAboutMeSettings,
  type AboutMeSettings
} from '../../../shared/about-me'

export { defaultAboutMeSettings }
export type { AboutMeSettings }

export const aboutMeStore = createPersistedStore<AboutMeSettings>({
  key: 'aboutMe',
  defaults: defaultAboutMeSettings,
  normalize: normalizeAboutMeSettings
})
