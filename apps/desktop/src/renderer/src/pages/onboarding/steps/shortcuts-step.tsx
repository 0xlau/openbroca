import React from 'react'
import { create } from 'zustand'
import { usePlatform } from '@renderer/hooks/use-platform'
import { useQuickTapDetection, useHoldDetection } from './shortcuts-detection'
import { ShortcutsDemo } from './shortcuts-demo'

type SubStep = 'quick' | 'hold'
type SubStepState = 'detecting' | 'demo-playing' | 'done'

interface ShortcutsStore {
  subStep: SubStep
  state: SubStepState
  bothDone: boolean
  reset: () => void
  markQuickDetected: () => void
  markQuickDemoComplete: () => void
  markHoldDetected: () => void
  markHoldDemoComplete: () => void
}

export const shortcutsStepStore = create<ShortcutsStore>((set) => ({
  subStep: 'quick',
  state: 'detecting',
  bothDone: false,
  reset: () => set({ subStep: 'quick', state: 'detecting', bothDone: false }),
  markQuickDetected: () => set({ state: 'demo-playing' }),
  markQuickDemoComplete: () => set({ subStep: 'hold', state: 'detecting' }),
  markHoldDetected: () => set({ state: 'demo-playing' }),
  markHoldDemoComplete: () => set({ state: 'done', bothDone: true })
}))

export function useShortcutsStepReady(): boolean {
  return shortcutsStepStore((s) => s.bothDone)
}

function KeyCap({
  children,
  active = false
}: {
  children: React.ReactNode
  active?: boolean
}): React.ReactElement {
  return (
    <span
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border bg-card px-2 text-base font-medium shadow-sm transition-all ${
        active ? 'translate-y-0.5 bg-primary text-primary-foreground shadow-none' : ''
      }`}
    >
      {children}
    </span>
  )
}

export function ShortcutsStep(): React.ReactElement {
  const { isMac } = usePlatform()
  const modifierKey: 'Meta' | 'Control' = isMac ? 'Meta' : 'Control'
  const modifierLabel = isMac ? '⌘' : 'Ctrl'

  const subStep = shortcutsStepStore((s) => s.subStep)
  const state = shortcutsStepStore((s) => s.state)
  const bothDone = shortcutsStepStore((s) => s.bothDone)

  useQuickTapDetection({
    active: subStep === 'quick' && state === 'detecting',
    modifierKey,
    onDetected: () => shortcutsStepStore.getState().markQuickDetected()
  })

  useHoldDetection({
    active: subStep === 'hold' && state === 'detecting',
    modifierKey,
    onDetected: () => shortcutsStepStore.getState().markHoldDetected()
  })

  if (bothDone) {
    return (
      <div className="flex w-full flex-col items-center gap-6 py-12 text-center">
        <h1 className="text-2xl font-semibold">You&apos;re all set.</h1>
        <p className="text-sm text-muted-foreground">
          Click the button in the bottom-right to open OpenBroca.
        </p>
      </div>
    )
  }

  const isQuick = subStep === 'quick'
  const transcript = isQuick
    ? 'Hello, OpenBroca.'
    : 'Long-press lets me dictate longer thoughts before I let go.'

  return (
    <div className="relative flex w-full flex-col gap-8" data-testid="shortcuts-step">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">
          {isQuick
            ? `Quick — double-tap ${modifierLabel} to start`
            : `Hold — press and hold ${modifierLabel}+Space`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isQuick
            ? 'Say a quick line. OpenBroca transcribes and pastes it into the app you’re using.'
            : 'Keep talking while you hold. Release when you’re done. Best for longer thoughts.'}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border/80 bg-muted/30 p-12">
        {isQuick ? (
          <div className="flex items-center gap-3" data-testid="shortcuts-keys">
            <KeyCap>{modifierLabel}</KeyCap>
            <span className="text-muted-foreground">·</span>
            <KeyCap>{modifierLabel}</KeyCap>
          </div>
        ) : (
          <div className="flex items-center gap-3" data-testid="shortcuts-keys">
            <KeyCap>{modifierLabel}</KeyCap>
            <span className="text-muted-foreground">+</span>
            <KeyCap>Space</KeyCap>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {state === 'detecting'
            ? isQuick
              ? `Tap ${modifierLabel} twice within 300 ms`
              : `Hold ${modifierLabel}+Space for at least half a second, then release`
            : 'Got it.'}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">If it doesn&apos;t register, just try again.</p>

      {state === 'demo-playing' && (
        <ShortcutsDemo
          transcript={transcript}
          onComplete={() => {
            if (isQuick) shortcutsStepStore.getState().markQuickDemoComplete()
            else shortcutsStepStore.getState().markHoldDemoComplete()
          }}
        />
      )}
    </div>
  )
}
