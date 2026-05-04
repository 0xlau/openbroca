import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { OnboardingMode } from '../onboarding-gate/types'

function hashFor(mode: OnboardingMode): string {
  if (mode === 'permission-recovery') return '/onboarding/permissions?variant=recovery'
  return '/onboarding/permissions'
}

export function createOnboardingWindow(mode: OnboardingMode): BrowserWindow {
  const window = new BrowserWindow({
    width: 800,
    height: 800,
    minWidth: 800,
    minHeight: 800,
    maxHeight: 800,
    maxWidth: 800,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 16 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  const hash = hashFor(mode)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#' + hash)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  return window
}
