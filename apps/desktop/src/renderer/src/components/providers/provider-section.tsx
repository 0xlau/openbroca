import { TypographyLarge } from '@openbroca/ui'
import type { ProviderConnectionRecord } from '@renderer/stores/provider-store'
import type { ProviderViewModel } from './provider-types'
import { ProviderRow } from './provider-row'

function resolveModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const model = value.trim()
  return model ? model : undefined
}

export function ProviderSection({
  section,
  title,
  providers,
  settings,
  providerSettings,
  activeProviderId,
  onConnect,
  onOpenSettings,
  onSetActive,
  onDisconnect
}: {
  section: 'llm' | 'asr'
  title: string
  providers: ProviderViewModel[]
  settings: Record<string, ProviderConnectionRecord | undefined>
  providerSettings: Record<string, Record<string, unknown> | undefined>
  activeProviderId?: string
  onConnect: (provider: ProviderViewModel) => void
  onOpenSettings: (provider: ProviderViewModel, section: 'llm' | 'asr') => void
  onSetActive: (section: 'llm' | 'asr', providerId: string) => void
  onDisconnect: (
    section: 'llm' | 'asr',
    providerId: string,
    connectionType: ProviderConnectionRecord['connectionType']
  ) => void
}) {
  const sortedProviders = providers
    .map((provider, index) => {
      const savedModel = section === 'llm' ? resolveModel(providerSettings[provider.id]?.model) : undefined
      const isConfiguredActive =
        activeProviderId === provider.id && (section === 'llm' ? Boolean(savedModel) : true)

      return {
        index,
        provider,
        isActive: activeProviderId === provider.id,
        isConfiguredActive,
        isConnected: !!settings[provider.id]?.enabled,
        savedModel
      }
    })
    .sort((left, right) => {
      const leftRank = left.isConfiguredActive ? 0 : left.isConnected ? 1 : 2
      const rightRank = right.isConfiguredActive ? 0 : right.isConnected ? 1 : 2

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
        {sortedProviders.map(({ provider, isActive, savedModel }, index) => (
          <ProviderRow
            key={provider.id}
            section={section}
            provider={provider}
            setting={settings[provider.id]}
            isActive={isActive}
            isLast={index === sortedProviders.length - 1}
            savedModel={section === 'llm' ? savedModel : undefined}
            onConnect={onConnect}
            onOpenSettings={(selectedProvider) => onOpenSettings(selectedProvider, section)}
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
