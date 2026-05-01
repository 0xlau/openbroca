import { useQuery } from '@tanstack/react-query'
import type { AudioDevice } from '@openbroca/audio-capture'
import { trpc } from '@renderer/trpc'
import { audioDevicesSnapshotStore } from '@renderer/stores/audio-devices-snapshot-store'
import type { AudioDeviceSnapshotEntry } from '../../../shared/audio-devices'
import { useEffect, useMemo } from 'react'

const EMPTY_BROWSER_DEVICES: MediaDeviceInfo[] = []

function normalizeDeviceMatchKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSuspiciousDeviceName(name: string): boolean {
  return (
    Array.from(name).some((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || char === '\ufffd'
    }) || /[\u00c0-\u00ff]{2,}/u.test(name)
  )
}

function findMatchingBrowserDevice(
  microphone: AudioDevice,
  browserDevices: MediaDeviceInfo[]
): MediaDeviceInfo | null {
  const target = normalizeDeviceMatchKey(microphone.name)
  const audioInputs = browserDevices.filter(
    (device) => device.kind === 'audioinput' && device.label
  )
  if (target.length === 0 || audioInputs.length === 0) return null

  const exactMatch = audioInputs.find((device) => normalizeDeviceMatchKey(device.label) === target)
  if (exactMatch) return exactMatch

  const fuzzyMatch = audioInputs.find((device) => {
    const label = normalizeDeviceMatchKey(device.label)
    return label.includes(target) || target.includes(label)
  })
  if (fuzzyMatch) return fuzzyMatch

  if (audioInputs.length === 1 && isSuspiciousDeviceName(microphone.name)) {
    return audioInputs[0] ?? null
  }

  return null
}

export function useMicrophones() {
  const query = trpc.audio.listDevices.useQuery()
  const browserDevicesQuery = useQuery({
    queryKey: ['browser-audio-input-devices'],
    queryFn: async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return []
      return navigator.mediaDevices.enumerateDevices()
    }
  })
  const browserDevices = browserDevicesQuery.data ?? EMPTY_BROWSER_DEVICES

  useEffect(() => {
    const handleDeviceChange = () => {
      void browserDevicesQuery.refetch()
    }

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [browserDevicesQuery])

  const microphones = useMemo(
    () =>
      (query.data ?? []).map((microphone) => {
        const browserDevice = findMatchingBrowserDevice(microphone, browserDevices)
        return {
          ...microphone,
          name: browserDevice?.label || microphone.name
        }
      }),
    [browserDevices, query.data]
  )

  const resolveBrowserDeviceId = (microphone: AudioDevice): string | null => {
    return findMatchingBrowserDevice(microphone, browserDevices)?.deviceId ?? null
  }

  // Persist the merged view so consumers outside the renderer (e.g. the tray
  // menu in the main process) read clean labels and pre-resolved browser ids
  // from a single source of truth instead of re-running the match themselves.
  useEffect(() => {
    if (query.data == null) return

    const snapshot: AudioDeviceSnapshotEntry[] = query.data.map((microphone) => {
      const browserDevice = findMatchingBrowserDevice(microphone, browserDevices)
      return {
        portAudioId: microphone.id,
        browserDeviceId: browserDevice?.deviceId ?? null,
        label: browserDevice?.label || microphone.name,
        isDefault: microphone.isDefault
      }
    })

    void audioDevicesSnapshotStore.getState().replace({ devices: snapshot })
  }, [browserDevices, query.data])

  return {
    microphones,
    refresh: async () => {
      await Promise.all([query.refetch(), browserDevicesQuery.refetch()])
    },
    isLoading:
      query.isLoading ||
      query.isRefetching ||
      browserDevicesQuery.isLoading ||
      browserDevicesQuery.isRefetching,
    resolveBrowserDeviceId
  }
}
