import { TypographyLarge } from '@openbroca/ui'
import type { ProviderConnectionRecord } from '@renderer/stores/provider-store'
import type { ProviderViewModel } from './provider-types'
import { ProviderRow } from './provider-row'

export function ProviderSection({
  section,
  title,
  providers,
  settings,
  activeProviderId,
  onConnect,
  onSetActive,
  onDisconnect
}: {
  section: 'llm' | 'asr'
  title: string
  providers: ProviderViewModel[]
  settings: Record<string, ProviderConnectionRecord | undefined>
  activeProviderId?: string
  onConnect: (provider: ProviderViewModel) => void
  onSetActive: (section: 'llm' | 'asr', providerId: string) => void
  onDisconnect: (
    section: 'llm' | 'asr',
    providerId: string,
    connectionType: ProviderConnectionRecord['connectionType']
  ) => void
}) {
  const sortedProviders = providers
    .map((provider, index) => ({
      index,
      provider,
      isActive: activeProviderId === provider.id,
      isConnected: !!settings[provider.id]?.enabled
    }))
    .sort((left, right) => {
      const leftRank = left.isActive ? 0 : left.isConnected ? 1 : 2
      const rightRank = right.isActive ? 0 : right.isConnected ? 1 : 2

      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }

      return left.index - right.index
    })

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <TypographyLarge>{title}</TypographyLarge>
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {sortedProviders.map(({ provider, isActive }, index) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            setting={settings[provider.id]}
            isActive={isActive}
            isLast={index === sortedProviders.length - 1}
            onConnect={onConnect}
            onSetActive={(providerId) => onSetActive(section, providerId)}
            onDisconnect={(providerId, connectionType) =>
              onDisconnect(section, providerId, connectionType)
            }
          />
        ))}
      </div>
    </section>
  )
}
