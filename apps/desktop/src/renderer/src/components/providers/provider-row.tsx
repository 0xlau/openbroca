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
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { trpc } from '@renderer/trpc'
import type { ProviderConnectionRecord } from '@renderer/stores/provider-store'
import type { ProviderViewModel } from './provider-types'
import {
  getOAuthConnectionOption,
  resolveProviderConnectionState,
  svgToDataUri
} from './provider-types'

export function ProviderRow({
  provider,
  setting,
  isActive,
  isLast,
  onConnect,
  onSetActive,
  onDisconnect
}: {
  provider: ProviderViewModel
  setting?: ProviderConnectionRecord
  isActive: boolean
  isLast: boolean
  onConnect: (provider: ProviderViewModel) => void
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
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={() => {
        if (!state.disconnectConnectionType) {
          return
        }
        onDisconnect(provider.id, state.disconnectConnectionType)
      }}
    >
      Disconnect
    </Button>
  )
  const activeButton = (
    <Button
      variant={state.isActive ? 'secondary' : 'ghost'}
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={() => onSetActive(provider.id)}
      disabled={state.isActive}
    >
      {state.isActive ? 'Active' : 'Set as active'}
    </Button>
  )

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
        {provider.icon ? (
          <img
            src={svgToDataUri(provider.icon)}
            alt={provider.displayName}
            className="size-9 shrink-0 object-contain p-1"
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
          <TypographyMuted className="mt-1 truncate text-xs">{state.description}</TypographyMuted>
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
            {disconnectButton}
            {activeButton}
          </div>
        ) : (
          null
        )}
      </div>
      {!isLast ? <Separator /> : null}
    </>
  )
}
