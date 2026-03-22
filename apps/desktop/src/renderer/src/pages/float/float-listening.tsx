import React from 'react'
import { Button, LiveWaveform } from '@openbroca/ui'
import '@renderer/styles/float-listening.css'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export const FloatListening: React.FC = () => {
  const showCancel = false

  return (
    <div className="flex gap-2">
      <div className="bg-background w-20 h-9 flex items-center justify-center rounded-full border">
        <LiveWaveform
          active={true}
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
      {showCancel && (
        <Button size="icon" variant="secondary">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}
