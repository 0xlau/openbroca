import React from 'react'

export function useQuickTapDetection(opts: {
  active: boolean
  modifierKey: 'Meta' | 'Control'
  onDetected: () => void
}): void {
  React.useEffect(() => {
    if (!opts.active) return

    let firstDownAt: number | null = null
    const QUICK_GAP_MS = 300

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== opts.modifierKey) return
      if (e.repeat) return
      const now = performance.now()
      if (firstDownAt !== null && now - firstDownAt <= QUICK_GAP_MS) {
        opts.onDetected()
        firstDownAt = null
        return
      }
      firstDownAt = now
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [opts.active, opts.modifierKey, opts.onDetected])
}

export function useHoldDetection(opts: {
  active: boolean
  modifierKey: 'Meta' | 'Control'
  onDetected: () => void
}): void {
  React.useEffect(() => {
    if (!opts.active) return

    const HOLD_MIN_MS = 500
    let modifierDownAt: number | null = null
    let bothDownAt: number | null = null

    function onKeyDown(e: KeyboardEvent): void {
      if (e.repeat) return
      if (e.key === opts.modifierKey) {
        if (modifierDownAt === null) modifierDownAt = performance.now()
      } else if (e.key === ' ' || e.code === 'Space') {
        if (modifierDownAt !== null && bothDownAt === null) bothDownAt = performance.now()
      }
    }

    function onKeyUp(e: KeyboardEvent): void {
      const isModifier = e.key === opts.modifierKey
      const isSpace = e.key === ' ' || e.code === 'Space'
      if (!isModifier && !isSpace) return
      if (bothDownAt !== null && performance.now() - bothDownAt >= HOLD_MIN_MS) {
        opts.onDetected()
      }
      modifierDownAt = null
      bothDownAt = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [opts.active, opts.modifierKey, opts.onDetected])
}
