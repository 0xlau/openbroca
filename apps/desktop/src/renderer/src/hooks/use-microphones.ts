import { useCallback, useEffect, useState } from 'react'

export function useMicrophones() {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setMicrophones(devices.filter((d) => d.kind === 'audioinput'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [refresh])

  return { microphones, refresh, isLoading }
}
