import { Badge, Button, Separator, TypographyMuted, TypographySmall } from '@openbroca/ui'
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
  isLast,
  onConnect,
  onDisconnect
}: {
  provider: ProviderViewModel
  setting?: ProviderConnectionRecord
  isLast: boolean
  onConnect: (provider: ProviderViewModel) => void
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

  const state = resolveProviderConnectionState(provider, setting, authStatus)

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
          {state.helperText ? (
            <TypographyMuted className="mt-1 text-xs">{state.helperText}</TypographyMuted>
          ) : null}
        </div>
        <Button
          variant={state.isConnected ? 'ghost' : 'secondary'}
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() =>
            state.isConnected && state.disconnectConnectionType
              ? onDisconnect(provider.id, state.disconnectConnectionType)
              : onConnect(provider)
          }
        >
          {state.isConnected ? null : <HugeiconsIcon icon={PlusSignIcon} size={14} />}
          {state.buttonLabel}
        </Button>
      </div>
      {!isLast ? <Separator /> : null}
    </>
  )
}
