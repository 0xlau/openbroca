import React from 'react'
import { LiveWaveform } from '@openbroca/ui'

export const FloatListening: React.FC = () => {
  return (
    <div className="bg-background/90 flex h-72 w-72 items-center justify-center rounded-full shadow-2xl backdrop-blur-xl">
      <LiveWaveform active={true} mode="static" height={120} className="w-48" />
    </div>
  )
}
