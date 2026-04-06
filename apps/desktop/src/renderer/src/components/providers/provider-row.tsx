import {
  Badge,
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Settings01Icon, Unlink04Icon } from '@hugeicons/core-free-icons'
import { trpc } from '@renderer/trpc'
import type { ProviderConnectionRecord } from '@renderer/stores/provider-store'
import type { ProviderViewModel } from './provider-types'
import {
  getLLMModelSummary,
  getOAuthConnectionOption,
  resolveProviderIconSrc,
  resolveProviderConnectionState,
  shouldInvertProviderIcon,
} from './provider-types'

function getSetupGuidance(
  setupStatus:
    | {
        canActivate: boolean
        summary?: string
        blockingReasons: string[]
        fieldErrors?: Record<string, string>
      }
    | undefined
): string | undefined {
  if (!setupStatus || setupStatus.canActivate) {
    return undefined
  }

  const blockingReason = setupStatus.blockingReasons.find((reason) => reason.trim().length > 0)
  if (blockingReason) {
    return blockingReason
  }

  const fieldError = Object.values(setupStatus.fieldErrors ?? {}).find((value) => value.trim().length > 0)
  if (fieldError) {
    return fieldError
  }

  const summary = setupStatus.summary?.trim()
  return summary ? summary : undefined
}

export function ProviderRow({
  section,
  provider,
  setting,
  isActive,
  isLast,
  savedModel,
  onConnect,
  onOpenSettings,
  onSetActive,
  onDisconnect
}: {
  section: 'llm' | 'asr'
  provider: ProviderViewModel
  setting?: ProviderConnectionRecord
  isActive: boolean
  isLast: boolean
  savedModel?: string
  onConnect: (provider: ProviderViewModel) => void
  onOpenSettings?: (provider: ProviderViewModel) => void
  onSetActive: (providerId: string) => void
  onDisconnect: (
    providerId: string,
    connectionType: ProviderConnectionRecord['connectionType']
  ) => void
}) {
  const oauthOption = getOAuthConnectionOption(provider)
  const isOAuth = !!oauthOption
  const { data: authStatus } = trpc.providerAuth.status.useQuery(
    { providerId: provider.id },
    { enabled: isOAuth }
  )

  const state = resolveProviderConnectionState(provider, setting, authStatus, isActive)
  const { data: setupStatus } = trpc.providers.getSetupStatus.useQuery(
    { providerId: provider.id, kind: section },
    { enabled: state.isConnected }
  )
  const canActivate = state.isConnected && setupStatus?.canActivate === true
  const isConfiguredActive = state.isActive && canActivate
  const modelSummary = section === 'llm' ? getLLMModelSummary(savedModel) : []
  const setupGuidance = state.isConnected ? getSetupGuidance(setupStatus) : undefined
  const hasSettings = provider.settingsItems.length > 0
  const iconSrc = resolveProviderIconSrc(provider.icon)
  const shouldInvertIcon = shouldInvertProviderIcon(provider.icon)
  const connectButton = (
    <Button
      variant="secondary"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={() => onConnect(provider)}
    >
      <HugeiconsIcon icon={PlusSignIcon} size={14} />
      Connect
    </Button>
  )
  const disconnectButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="shrink-0"
      aria-label="Disconnect"
      onClick={() => {
        if (!state.disconnectConnectionType) {
          return
        }
        onDisconnect(provider.id, state.disconnectConnectionType)
      }}
    >
      <HugeiconsIcon icon={Unlink04Icon} strokeWidth={2} size={14} />
    </Button>
  )
  const activeButton = (
    <Button
      variant={isConfiguredActive ? 'secondary' : 'ghost'}
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={() => onSetActive(provider.id)}
      disabled={!canActivate || isConfiguredActive}
    >
      {isConfiguredActive ? 'Current' : 'Set as active'}
    </Button>
  )
  const settingsButton =
    state.isConnected && hasSettings && onOpenSettings ? (
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={`Open settings for ${provider.displayName}`}
        onClick={() => onOpenSettings(provider)}
      >
        <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} size={14} />
      </Button>
    ) : null

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
        {iconSrc ? (
          <img
            src={iconSrc}
            alt={provider.displayName}
            className={`size-9 shrink-0 object-contain p-1 ${shouldInvertIcon ? 'dark:invert' : ''}`}
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-foreground/10">
            <span className="text-xs font-semibold text-muted-foreground">
              {provider.displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TypographySmall>{provider.displayName}</TypographySmall>
            {state.statusBadge ? (
              <Badge variant="secondary" className="text-xs">
                {state.statusBadge}
              </Badge>
            ) : null}
          </div>
          <TypographyMuted className="mt-1 text-xs">{state.description}</TypographyMuted>
          {modelSummary.map((line) => (
            <TypographyMuted key={line} className="mt-1 text-xs">
              {line}
            </TypographyMuted>
          ))}
          {setupGuidance ? (
            <TypographyMuted className="mt-1 text-xs">{setupGuidance}</TypographyMuted>
          ) : null}
        </div>
        {!state.isConnected && state.helperText ? (
          <Tooltip>
            <TooltipTrigger asChild>{connectButton}</TooltipTrigger>
            <TooltipContent sideOffset={0} side="left">
              {state.helperText}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {!state.isConnected && !state.helperText ? connectButton : null}
        {state.isConnected ? (
          <div className="flex items-center gap-2">
            {settingsButton}
            {activeButton}
            {disconnectButton}
          </div>
        ) : null}
      </div>
      {!isLast ? <Separator /> : null}
    </>
  )
}
