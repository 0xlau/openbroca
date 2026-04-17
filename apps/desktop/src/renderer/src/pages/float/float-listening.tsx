import React, { useEffect } from 'react'
import { Button, LiveWaveform, ShimmeringText } from '@openbroca/ui'
import '@renderer/styles/float-listening.css'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { microphoneStore } from '@renderer/stores/microphone-store'
import { listeningSessionStore } from '@renderer/stores/listening-session-store'
import { useStore } from 'zustand'
import { cn } from '@openbroca/ui'

export const FloatListening: React.FC = () => {
  useEffect(() => {
    document.body.classList.add('float-listening')
    return () => document.body.classList.remove('float-listening')
  }, [])

  const { data } = useStore(microphoneStore)
  const { bridge } = useStore(listeningSessionStore)
  const { state, targetApp } = bridge
  const showProcessing = state.status === 'stopping' || state.status === 'processing'
  const showCancel = state.status === 'processing'

  return (
    <div className="flex gap-2">
      <div
        className={cn(
          'bg-background h-9 shrink-0 flex items-center rounded-full border gap-2',
          showProcessing
            ? 'w-[320px] justify-between px-3'
            : targetApp?.iconDataUrl
              ? 'justify-center px-2 pr-3'
              : 'justify-center px-4'
        )}
      >
        {!showProcessing && targetApp?.iconDataUrl ? (
          <div
            className="size-6 shrink-0 overflow-hidden rounded-full"
            data-testid="float-target-app-icon"
          >
            <img
              src={targetApp.iconDataUrl}
              alt={`${targetApp.displayName} icon`}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        {showProcessing ? (
          <div className="flex min-w-0 items-center gap-3">
            <ShimmeringText className="text-sm">Thinking...</ShimmeringText>
          </div>
        ) : (
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
        )}
      </div>

      {showCancel ? (
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void window.api.listeningSession.cancelProcessing()}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  )
}
