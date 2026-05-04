import React from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@openbroca/ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { Login01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { usePlatform } from '@renderer/hooks/use-platform'
import { markOnboardingComplete } from '@renderer/stores/onboarding-store'
import { PermissionsStep, usePermissionsStepReady } from './steps/permissions-step'
import { useProvidersStepReady } from './steps/providers-step'
import { useShortcutsStepReady } from './steps/shortcuts-step'

// macOS: titleBarStyle: 'hiddenInset' keeps the traffic lights but removes the
// title bar, leaving the user with no native draggable region. We render a
// transparent drag strip at the top so the window can still be moved.
function DragBar({ isMac }: { isMac: boolean }): React.ReactElement | null {
  if (!isMac) return null
  return (
    <div
      className="h-11 shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-testid="onboarding-drag-bar"
    />
  )
}

type StepId = 'permissions' | 'providers' | 'shortcuts'

const STEP_LABELS: Record<StepId, string> = {
  permissions: 'Permissions',
  providers: 'Providers',
  shortcuts: 'Shortcuts'
}

const STEP_ORDER: StepId[] = ['permissions', 'providers', 'shortcuts']

function getCurrentStep(pathname: string): StepId {
  if (pathname.endsWith('/providers')) return 'providers'
  if (pathname.endsWith('/shortcuts')) return 'shortcuts'
  return 'permissions'
}

export function OnboardingShell(): React.ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const variant = searchParams.get('variant')
  const { isMac } = usePlatform()

  // Always-on hooks (Rules of Hooks: never called conditionally)
  const permissionsReady = usePermissionsStepReady()
  const providersReady = useProvidersStepReady()
  const shortcutsReady = useShortcutsStepReady()

  if (variant === 'recovery') {
    return (
      <div className="flex min-h-screen flex-col">
        <DragBar isMac={isMac} />
        <div className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 pb-8">
          <PermissionsStep variant="recovery" />
        </div>
      </div>
    )
  }

  const currentStep = getCurrentStep(location.pathname)
  const readyByStep: Record<StepId, boolean> = {
    permissions: permissionsReady,
    providers: providersReady,
    shortcuts: shortcutsReady
  }
  const currentReady = readyByStep[currentStep]
  const isLastStep = currentStep === 'shortcuts'

  async function handleContinue(): Promise<void> {
    if (currentStep === 'permissions') navigate('/onboarding/providers')
    else if (currentStep === 'providers') navigate('/onboarding/shortcuts')
    else await markOnboardingComplete()
  }

  function handleBack(): void {
    if (currentStep === 'providers') navigate('/onboarding/permissions')
    else if (currentStep === 'shortcuts') navigate('/onboarding/providers')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DragBar isMac={isMac} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pb-8 pt-2">
        <div data-testid="onboarding-stepper" className="flex items-center gap-3">
        {STEP_ORDER.map((id, index) => {
          const isCurrent = id === currentStep
          const isComplete = readyByStep[id]
          return (
            <React.Fragment key={id}>
              <div
                className={`flex size-8 items-center justify-center rounded-full border-2 text-sm font-medium ${
                  isComplete
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'border-primary bg-background text-primary'
                      : 'border-muted bg-muted text-muted-foreground'
                }`}
              >
                {isComplete ? (
                  <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </div>
              <span className={`text-sm ${isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                {STEP_LABELS[id]}
              </span>
              {index < STEP_ORDER.length - 1 && <div className="h-px flex-1 bg-border" />}
            </React.Fragment>
          )
        })}
      </div>

      <div className="flex-1">
        <Outlet />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} disabled={currentStep === 'permissions'}>
          ← Back
        </Button>
        <Button onClick={() => void handleContinue()} disabled={!currentReady}>
          {isLastStep ? 'Open OpenBroca →' : 'Continue →'}
          {isLastStep && <HugeiconsIcon icon={Login01Icon} strokeWidth={2} />}
        </Button>
      </div>
      </div>
    </div>
  )
}
