import React from 'react'
import { Button, Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@openbroca/ui'
import Logo from '@renderer/assets/logo.svg?react'
import {
  CursorInWindowIcon,
  Login01Icon,
  Mic01Icon,
  ShieldBanIcon,
  Tick02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  PermissionGateSnapshot,
  PermissionItem,
  PermissionKey
} from '../../../../main/permission-gate/types'

type PermissionCardConfig = {
  icon: 'microphone' | 'accessibility'
  title: string
  description: string
  safeDescription: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function getPermissionCardConfig(permission: PermissionItem): PermissionCardConfig {
  if (permission.key === 'microphone') {
    return {
      icon: 'microphone',
      title: 'Microphone Access',
      description: 'Allow openbroca to hear your voice and provide real-time responses.',
      safeDescription: 'Your audio is private and secure'
    }
  }

  return {
    icon: 'accessibility',
    title: 'Accessibility Access',
    description: 'Allow OpenBroca to paste into other apps and streamline your workflow',
    safeDescription: "You're in control at all times"
  }
}

function createFallbackPermission(key: PermissionKey): PermissionItem {
  return {
    key,
    title: key === 'microphone' ? 'Microphone' : 'Accessibility',
    description:
      key === 'microphone'
        ? 'Allow OpenBroca to hear your voice.'
        : 'Allow OpenBroca to paste into other apps.',
    status: 'missing'
  }
}

function getPermission(
  snapshot: PermissionGateSnapshot | null,
  key: PermissionKey
): PermissionItem {
  return (
    snapshot?.permissions.find((permission) => permission.key === key) ??
    createFallbackPermission(key)
  )
}

// Touch the actual audio device so macOS registers Openbroca in the TCC
// database. systemPreferences.askForMediaAccess only does this on the very
// first call (status === 'not-determined'); once denied — or when the binary
// changed (dev → prod) — the app can be missing from System Settings entirely,
// leaving the user with no toggle to flip. getUserMedia goes through
// Chromium's media stack and re-registers reliably.
async function probeMicrophoneAccess(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch {
    return false
  }
}

function PermissionCard({
  permission,
  isPending,
  onAction
}: {
  permission: PermissionItem
  isPending: boolean
  onAction: (permission: PermissionItem) => void
}) {
  const config = getPermissionCardConfig(permission)
  const isGranted = permission.status === 'granted'
  const icon =
    config.icon === 'microphone' ? (
      <HugeiconsIcon icon={Mic01Icon} size={20} strokeWidth={2} />
    ) : (
      <HugeiconsIcon icon={CursorInWindowIcon} size={20} strokeWidth={2} />
    )

  return (
    <Card className="border-border/80 shadow-xs" data-testid="permission-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <CardHeader className="flex-1 p-0">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              {icon}
            </div>
            <div className="space-y-1.5">
              <CardTitle>{config.title}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                <HugeiconsIcon
                  data-testid="permission-status-icon"
                  icon={ShieldBanIcon}
                  size={14}
                  strokeWidth={2}
                />
                {config.safeDescription}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardFooter className="p-0">
          <Button
            className="w-full sm:w-auto"
            disabled={isPending || isGranted}
            onClick={() => onAction(permission)}
            variant={isGranted ? 'secondary' : 'default'}
          >
            {isGranted && (
              <HugeiconsIcon
                data-testid="permission-action-icon-check"
                icon={Tick02Icon}
                size={16}
                strokeWidth={2}
              />
            )}
            {isGranted ? 'Granted' : 'Grant Access'}
          </Button>
        </CardFooter>
      </div>
    </Card>
  )
}

export const PermissionOnboarding: React.FC = () => {
  const [snapshot, setSnapshot] = React.useState<PermissionGateSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isContinuing, setIsContinuing] = React.useState(false)
  const [pendingPermissionKey, setPendingPermissionKey] = React.useState<
    PermissionItem['key'] | null
  >(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    void (async () => {
      try {
        const nextSnapshot = await window.api.permissions.getSnapshot()
        if (!active) {
          return
        }

        setSnapshot(nextSnapshot)
        setErrorMessage(null)
      } catch (error) {
        if (!active) {
          return
        }

        setErrorMessage(getErrorMessage(error, 'Unable to load permissions right now.'))
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [])

  async function handlePermissionAction(permission: PermissionItem) {
    setPendingPermissionKey(permission.key)
    setErrorMessage(null)

    try {
      let nextSnapshot: PermissionGateSnapshot
      if (permission.key === 'microphone') {
        const wasNotDetermined = permission.status === 'missing'
        const probed = await probeMicrophoneAccess()

        // After probing: if the OS just showed its prompt (was not-determined) or
        // the probe succeeded, refresh and let the user see the result. Only fall
        // through to opening System Settings when the user already denied earlier
        // and the probe couldn't recover.
        nextSnapshot =
          probed || wasNotDetermined
            ? await window.api.permissions.refresh()
            : await window.api.permissions.requestMicrophone()
      } else {
        nextSnapshot = await window.api.permissions.openDesktopControlSettings()
      }

      setSnapshot(nextSnapshot)
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          permission.key === 'microphone'
            ? 'Unable to refresh microphone permission right now.'
            : 'Unable to refresh accessibility permission right now.'
        )
      )
    } finally {
      setPendingPermissionKey(null)
    }
  }

  async function handleContinue() {
    setIsContinuing(true)
    setErrorMessage(null)

    try {
      const nextSnapshot = await window.api.permissions.refresh()
      setSnapshot(nextSnapshot)
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Unable to continue right now.'))
    } finally {
      setIsContinuing(false)
    }
  }

  const microphonePermission = getPermission(snapshot, 'microphone')
  const accessibilityPermission = getPermission(snapshot, 'desktopControl')
  const shouldShowCards = !isLoading && snapshot !== null

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-8">
      <div className="flex w-full flex-col gap-6">
        <div className="space-y-4">
          <Logo className="h-10 w-auto" data-testid="openbroca-logo" />
          <h1 className="text-xl font-semibold tracking-tight">Permission Required</h1>
          <p className="text-sm text-muted-foreground">
            Allow microphone and accessibility access to continue.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4">
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading permissions...</p>
          ) : shouldShowCards ? (
            <>
              <PermissionCard
                isPending={pendingPermissionKey === 'microphone'}
                onAction={handlePermissionAction}
                permission={microphonePermission}
              />
              <PermissionCard
                isPending={pendingPermissionKey === 'desktopControl'}
                onAction={handlePermissionAction}
                permission={accessibilityPermission}
              />
            </>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            You can change these settings anytime in Preferences.
          </p>
          <Button
            className="px-10"
            disabled={isLoading || isContinuing || !snapshot?.canEnterMainWindow}
            onClick={handleContinue}
          >
            {isContinuing ? 'Continuing...' : 'Continue to OpenBroca'}
            <HugeiconsIcon icon={Login01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  )
}
