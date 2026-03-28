import { createPersistedStore } from './create-persisted-store'

export interface AboutMeSettings {
  nickname: string
  email: string
  occupation: string
  bio: string
}

export const defaultAboutMeSettings: AboutMeSettings = {
  nickname: '',
  email: '',
  occupation: '',
  bio: ''
}

export const aboutMeStore = createPersistedStore<AboutMeSettings>({
  key: 'aboutMe',
  defaults: defaultAboutMeSettings
})
