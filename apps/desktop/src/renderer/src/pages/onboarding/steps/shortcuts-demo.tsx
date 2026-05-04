import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mic01Icon, Tick02Icon } from '@hugeicons/core-free-icons'

type Stage = 'listening' | 'transcribing' | 'pasted'

const STAGE_DURATIONS: Record<Stage, number> = {
  listening: 1000,
  transcribing: 600,
  pasted: 1400
}

export interface ShortcutsDemoProps {
  transcript: string
  onComplete: () => void
}

export function ShortcutsDemo({ transcript, onComplete }: ShortcutsDemoProps): React.ReactElement {
  const [stage, setStage] = React.useState<Stage>('listening')

  React.useEffect(() => {
    let cancelled = false
    const timeouts: NodeJS.Timeout[] = []

    const transcribeT = setTimeout(() => {
      if (cancelled) return
      setStage('transcribing')
    }, STAGE_DURATIONS.listening)
    timeouts.push(transcribeT)

    const pastedT = setTimeout(() => {
      if (cancelled) return
      setStage('pasted')
    }, STAGE_DURATIONS.listening + STAGE_DURATIONS.transcribing)
    timeouts.push(pastedT)

    const completeT = setTimeout(
      () => {
        if (cancelled) return
        onComplete()
      },
      STAGE_DURATIONS.listening + STAGE_DURATIONS.transcribing + STAGE_DURATIONS.pasted
    )
    timeouts.push(completeT)

    return () => {
      cancelled = true
      timeouts.forEach((t) => clearTimeout(t))
    }
  }, [onComplete])

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          data-testid="demo-stage"
          data-stage={stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-border/80 bg-card px-6 py-4 shadow-2xl"
        >
          {stage === 'listening' && (
            <div className="flex items-center gap-3">
              <HugeiconsIcon icon={Mic01Icon} size={24} strokeWidth={2} />
              <span className="text-sm">Listening...</span>
            </div>
          )}
          {stage === 'transcribing' && (
            <div className="flex items-center gap-3">
              <span className="text-sm">Transcribing...</span>
            </div>
          )}
          {stage === 'pasted' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.5} />
                <span>&ldquo;{transcript}&rdquo;</span>
              </div>
              <span className="text-xs text-muted-foreground">Pasted to your active app</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
