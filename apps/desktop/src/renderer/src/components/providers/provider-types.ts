import type { inferRouterOutputs } from '@trpc/server'
import type { ProviderConnectionOption, ProviderConnectionType } from '@openbroca/providers'
import type { ProviderAuthState } from '../../../../shared/provider-auth'
import type { ProviderConnectionRecord } from '@renderer/stores/provider-store'
import type { AppRouter } from '../../../../main/trpc/router'

type RouterOutputs = inferRouterOutputs<AppRouter>
type ProviderDescriptor =
  | RouterOutputs['providers']['listLLM'][number]
  | RouterOutputs['providers']['listASR'][number]

export type ProviderViewModel = Omit<ProviderDescriptor, 'icon'> & {
  icon?: string
}

export type EditableProviderConnectionOption = Extract<
  ProviderConnectionOption,
  { type: 'apiKey' | 'local' }
>

export type OAuthProviderConnectionOption = Extract<ProviderConnectionOption, { type: 'oauth' }>

export function getConnectionOptionByType(
  provider: ProviderViewModel | null,
  connectionType: ProviderConnectionType | undefined
): ProviderConnectionOption | undefined {
  if (!provider || !connectionType) {
    return undefined
  }

  return provider.connectionOptions.find((option) => option.type === connectionType)
}

export function getOAuthConnectionOption(
  provider: ProviderViewModel
): OAuthProviderConnectionOption | undefined {
  return provider.connectionOptions.find(
    (option): option is OAuthProviderConnectionOption => option.type === 'oauth'
  )
}

export function isOAuthProvider(provider: ProviderViewModel): boolean {
  return !!getOAuthConnectionOption(provider)
}

export function isOAuthSetting(
  setting: ProviderConnectionRecord | undefined
): setting is Extract<ProviderConnectionRecord, { connectionType: 'oauth' }> {
  return setting?.connectionType === 'oauth'
}

export function isOAuthConnected(status: ProviderAuthState | undefined): boolean {
  return status?.status === 'connected'
}

export function getProviderConnectedLabel(
  status: ProviderAuthState | undefined
): string | undefined {
  if (status?.status !== 'connected') {
    return undefined
  }

  return status.account?.email ?? status.account?.accountId ?? status.providerId
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function toProviderViewModel<T extends ProviderDescriptor>(provider: T): ProviderViewModel {
  return {
    ...provider,
    icon: provider.icon ?? undefined
  }
}

export interface ResolvedProviderConnectionState {
  buttonLabel: 'Connect' | 'Disconnect'
  description: string
  disconnectConnectionType?: ProviderConnectionRecord['connectionType']
  helperText?: string
  isConnected: boolean
  isConnectedViaOAuth: boolean
  statusBadge?: string
}

export function resolveProviderConnectionState(
  provider: ProviderViewModel,
  setting: ProviderConnectionRecord | undefined,
  authStatus: ProviderAuthState | undefined
): ResolvedProviderConnectionState {
  const oauthOption = getOAuthConnectionOption(provider)
  const isOAuth = !!oauthOption
  const isOAuthConnection = isOAuthSetting(setting)
  const isManualConnection = !!setting?.enabled && !isOAuthConnection
  const isConnectedViaOAuth = isOAuth && !isManualConnection && isOAuthConnected(authStatus)
  const isConnected = isManualConnection || isConnectedViaOAuth
  const connectedLabel = isConnectedViaOAuth ? getProviderConnectedLabel(authStatus) : undefined
  const statusBadge = isConnectedViaOAuth
    ? 'OAuth'
    : 'kind' in provider && provider.kind === 'local'
      ? 'Local'
      : undefined

  return {
    buttonLabel: isConnected ? 'Disconnect' : 'Connect',
    description: isConnected && connectedLabel ? connectedLabel : provider.description,
    disconnectConnectionType: isConnected
      ? isConnectedViaOAuth
        ? 'oauth'
        : (setting?.connectionType ?? 'apiKey')
      : undefined,
    helperText:
      isOAuth && oauthOption?.flow === 'systemBrowser' && !isConnected
        ? 'Browser sign-in required'
        : undefined,
    isConnected,
    isConnectedViaOAuth,
    statusBadge
  }
}
