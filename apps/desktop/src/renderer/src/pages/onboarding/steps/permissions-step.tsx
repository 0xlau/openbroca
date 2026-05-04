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
  OnboardingGateSnapshot,
  PermissionItem,
  PermissionStatus
} from '../../../../../main/onboarding-gate/types'

type PermissionKey = PermissionItem['key']

type PermissionCardConfig = {
  icon: 'microphone' | 'accessibility'
  title: string
  description: string
  safeDescription: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
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
    status: 'missing' as PermissionStatus
  }
}

function getPermission(
  snapshot: OnboardingGateSnapshot | null,
  key: PermissionKey
): PermissionItem {
  return snapshot?.permissions.find((p) => p.key === key) ?? createFallbackPermission(key)
}

async function probeMicrophoneAccess(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
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
}): React.ReactElement {
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

interface SnapshotState {
  snapshot: OnboardingGateSnapshot | null
  isLoading: boolean
  errorMessage: string | null
}

function useOnboardingSnapshot(): SnapshotState & {
  setSnapshot: React.Dispatch<React.SetStateAction<OnboardingGateSnapshot | null>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
} {
  const [snapshot, setSnapshot] = React.useState<OnboardingGateSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    void (async () => {
      try {
        const next = (await window.api.permissions.getSnapshot()) as OnboardingGateSnapshot
        if (!active) return
        setSnapshot(next)
        setErrorMessage(null)
      } catch (error) {
        if (!active) return
        setErrorMessage(getErrorMessage(error, 'Unable to load permissions right now.'))
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    const unsubscribe = window.api.permissions.onStateChange((next) => {
      setSnapshot(next as OnboardingGateSnapshot)
      setErrorMessage(null)
    })
    return unsubscribe
  }, [])

  return { snapshot, isLoading, errorMessage, setSnapshot, setErrorMessage }
}

export function usePermissionsStepReady(): boolean {
  const { snapshot } = useOnboardingSnapshot()
  return snapshot?.permissionsOk === true
}

export interface PermissionsStepProps {
  variant?: 'wizard' | 'recovery'
}

export function PermissionsStep({ variant = 'wizard' }: PermissionsStepProps): React.ReactElement {
  const { snapshot, isLoading, errorMessage, setSnapshot, setErrorMessage } =
    useOnboardingSnapshot()
  const [pendingPermissionKey, setPendingPermissionKey] = React.useState<
    PermissionItem['key'] | null
  >(null)
  const [isContinuing, setIsContinuing] = React.useState(false)

  async function handlePermissionAction(permission: PermissionItem): Promise<void> {
    setPendingPermissionKey(permission.key)
    setErrorMessage(null)
    try {
      let nextSnapshot: OnboardingGateSnapshot
      if (permission.key === 'microphone') {
        const wasNotDetermined = permission.status === 'missing'
        const probed = await probeMicrophoneAccess()
        nextSnapshot =
          probed || wasNotDetermined
            ? ((await window.api.permissions.refresh()) as OnboardingGateSnapshot)
            : ((await window.api.permissions.requestMicrophone()) as OnboardingGateSnapshot)
      } else {
        nextSnapshot =
          (await window.api.permissions.openDesktopControlSettings()) as OnboardingGateSnapshot
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

  async function handleContinue(): Promise<void> {
    setIsContinuing(true)
    setErrorMessage(null)
    try {
      const next = (await window.api.permissions.refresh()) as OnboardingGateSnapshot
      setSnapshot(next)
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Unable to continue right now.'))
    } finally {
      setIsContinuing(false)
    }
  }

  const microphone = getPermission(snapshot, 'microphone')
  const accessibility = getPermission(snapshot, 'desktopControl')
  const showCards = !isLoading && snapshot !== null

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="space-y-4">
        <Logo className="h-10 w-auto" data-testid="openbroca-logo" />
        <h1 className="text-xl font-semibold tracking-tight">Permission Required</h1>
        <p className="text-sm text-muted-foreground">
          Allow microphone and accessibility access to continue.
        </p>
      </div>

      <div className="flex w-full flex-col gap-4">
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading permissions...</p>
        ) : showCards ? (
          <>
            <PermissionCard
              isPending={pendingPermissionKey === 'microphone'}
              onAction={(p) => void handlePermissionAction(p)}
              permission={microphone}
            />
            <PermissionCard
              isPending={pendingPermissionKey === 'desktopControl'}
              onAction={(p) => void handlePermissionAction(p)}
              permission={accessibility}
            />
          </>
        ) : null}
      </div>

      {variant === 'recovery' ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            You can change these settings anytime in Preferences.
          </p>
          <Button
            className="px-10"
            disabled={isLoading || isContinuing || !snapshot?.canEnterMainWindow}
            onClick={() => void handleContinue()}
          >
            {isContinuing ? 'Continuing...' : 'Continue to OpenBroca'}
            <HugeiconsIcon icon={Login01Icon} strokeWidth={2} />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
