import { createPersistedStore } from './create-persisted-store'
import {
  DEFAULT_SHORTCUT_SETTINGS,
  normalizeShortcutSettings,
  resolveDefaultShortcutSettings,
  type ShortcutSettings
} from '../../../shared/shortcuts'

function getRendererPlatform(): string | undefined {
  if (typeof window !== 'undefined') {
    return window.electron?.process?.platform ?? globalThis.process?.platform
  }

  return globalThis.process?.platform
}

const rendererPlatform = getRendererPlatform()

export const defaultShortcutSettings =
  rendererPlatform == null
    ? DEFAULT_SHORTCUT_SETTINGS
    : resolveDefaultShortcutSettings(rendererPlatform)

export const shortcutsStore = createPersistedStore<ShortcutSettings>({
  key: 'shortcuts',
  defaults: defaultShortcutSettings,
  normalize: (raw) => normalizeShortcutSettings(raw, rendererPlatform)
})
