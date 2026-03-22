import { useMemo } from 'react'

// Uses window.electron.process.platform (exposed by @electron-toolkit/preload)
// to get a reliable, synchronous OS identifier — more accurate than
// navigator.userAgent in an Electron context.
export function usePlatform() {
  return useMemo(() => {
    const platform = window.electron.process.platform
    return {
      isMac: platform === 'darwin',
      isWindows: platform === 'win32',
      isLinux: platform === 'linux'
    }
  }, [])
}
