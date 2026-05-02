import React, { useEffect } from 'react'
import { Button, LiveWaveform, ShimmeringText } from '@openbroca/ui'
import '@renderer/styles/float-listening.css'
import { Cancel01Icon, Delete02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { microphoneStore } from '@renderer/stores/microphone-store'
import { listeningSessionStore } from '@renderer/stores/listening-session-store'
import { useStore } from 'zustand'
import { cn } from '@openbroca/ui'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type TargetAndTransition,
  type Transition
} from 'motion/react'
import { isProcessingShellState } from '../../../../shared/listening-session-state'

const layoutSpring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 34,
  mass: 0.7
}

const buttonSpring: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 30,
  mass: 0.55
}

const contentTween: Transition = { duration: 0.22, ease: [0.32, 0.72, 0, 1] }

type ButtonAnim = {
  initial: TargetAndTransition
  animate: TargetAndTransition
  exit: TargetAndTransition
}

const sideButtonAnim = (from: 'left' | 'right'): ButtonAnim => {
  const offset = from === 'left' ? 14 : -24
  return {
    initial: { opacity: 0, scale: 0.5, x: offset, filter: 'blur(3px)' },
    animate: { opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, scale: 0.5, x: offset, filter: 'blur(3px)' }
  }
}

const leftButtonAnim = sideButtonAnim('left')
const rightButtonAnim = sideButtonAnim('right')

const rightButtonOriginStyle = { originX: 0 } as const

export const FloatListening: React.FC = () => {
  useEffect(() => {
    document.body.classList.add('float-listening')
    return () => document.body.classList.remove('float-listening')
  }, [])

  const { data } = useStore(microphoneStore)
  const { bridge } = useStore(listeningSessionStore)
  const { state, targetApp } = bridge
  const showProcessing = isProcessingShellState(state)
  const showConfirm =
    state.status === 'listening' &&
    (bridge.captureMode === 'latched' || bridge.captureMode === 'hold')
  const showCaptureCancel =
    state.status === 'listening' &&
    (bridge.captureMode === 'latched' || bridge.captureMode === 'hold')
  const showProcessingCancel = state.status === 'processing'

  return (
    <MotionConfig transition={layoutSpring}>
      <motion.div layout className={cn('flex gap-2', showProcessing && 'w-full max-w-full')}>
        <AnimatePresence initial={false} mode="popLayout">
          {showConfirm ? (
            <motion.div
              key="confirm"
              layout
              initial={leftButtonAnim.initial}
              animate={leftButtonAnim.animate}
              exit={leftButtonAnim.exit}
              transition={buttonSpring}
              whileTap={{ scale: 0.92 }}
              className="shrink-0"
            >
              <Button
                aria-label="Confirm capture"
                size="icon"
                variant="secondary"
                onClick={() => void window.api.listeningSession.finishCapture()}
              >
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          layout
          className={cn(
            'bg-background text-foreground flex h-9 items-center gap-2 overflow-hidden rounded-full border',
            showProcessing
              ? 'min-w-0 flex-1 justify-center px-3'
              : targetApp?.iconDataUrl
                ? 'shrink-0 justify-center px-2 pr-3'
                : 'shrink-0 justify-center px-4'
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {!showProcessing && targetApp?.iconDataUrl ? (
              <motion.div
                key="target-app-icon"
                layout
                initial={{ opacity: 0, scale: 0.4, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.4, filter: 'blur(4px)' }}
                transition={buttonSpring}
                className="size-6 shrink-0 overflow-hidden rounded-full"
                data-testid="float-target-app-icon"
              >
                <img
                  src={targetApp.iconDataUrl}
                  alt={`${targetApp.displayName} icon`}
                  className="h-full w-full object-cover"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false} mode="popLayout">
            {showProcessing ? (
              <motion.div
                key="processing"
                layout
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                transition={contentTween}
                className="flex min-w-0 items-center gap-3"
              >
                <ShimmeringText
                  text="Thinking..."
                  className="text-xs"
                  startOnView={false}
                  color="var(--muted-foreground)"
                  shimmerColor="var(--foreground)"
                />
              </motion.div>
            ) : (
              <div key="waveform" className="flex items-center">
                <LiveWaveform
                  active={state.status === 'listening'}
                  deviceId={data.selectedBrowserDeviceId ?? undefined}
                  mode="static"
                  barColor="oklch(0.646 0.222 41.116)"
                  barWidth={2}
                  barRadius={999}
                  barGap={2}
                  barHeight={1}
                  height={32}
                  className="w-12"
                />
              </div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence initial={false} mode="popLayout">
          {showCaptureCancel ? (
            <motion.div
              key="capture-cancel"
              layout
              style={rightButtonOriginStyle}
              initial={rightButtonAnim.initial}
              animate={rightButtonAnim.animate}
              exit={rightButtonAnim.exit}
              transition={buttonSpring}
              whileTap={{ scale: 0.92 }}
              className="shrink-0"
            >
              <Button
                aria-label="Cancel capture"
                size="icon"
                variant="destructive"
                onClick={() => void window.api.listeningSession.cancelCapture()}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </motion.div>
          ) : null}

          {showProcessingCancel ? (
            <motion.div
              key="processing-cancel"
              layout
              style={rightButtonOriginStyle}
              initial={rightButtonAnim.initial}
              animate={rightButtonAnim.animate}
              exit={rightButtonAnim.exit}
              transition={buttonSpring}
              whileTap={{ scale: 0.92 }}
              className="shrink-0"
            >
              <Button
                aria-label="Cancel processing"
                size="icon"
                variant="secondary"
                onClick={() => void window.api.listeningSession.cancelProcessing()}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  )
}
