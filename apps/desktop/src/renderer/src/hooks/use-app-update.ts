import { useCallback, useEffect, useState } from 'react'
import { trpcClient } from '@renderer/trpc/client'
import type { AppUpdateState } from '../../../shared/app-update'

export function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState | null>(null)

  useEffect(() => {
    let isMounted = true

    trpcClient.updates.getState
      .query()
      .then((snapshot) => {
        if (isMounted) {
          setState(snapshot)
        }
      })
      .catch(() => undefined)

    const subscription = trpcClient.updates.watch.subscribe(undefined, {
      onData: (snapshot) => {
        if (isMounted) {
          setState(snapshot)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const check = useCallback(async () => {
    try {
      const snapshot = await trpcClient.updates.check.mutate()
      setState(snapshot)
    } catch {
      // The main process publishes updater errors into state when possible.
    }
  }, [])

  const install = useCallback(async () => {
    try {
      const snapshot = await trpcClient.updates.install.mutate()
      setState(snapshot)
    } catch {
      // The main process publishes updater errors into state when possible.
    }
  }, [])

  return { state, check, install }
}
