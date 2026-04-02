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
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <TypographyLarge>{title}</TypographyLarge>
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {providers.map((provider, index) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            setting={settings[provider.id]}
            isActive={activeProviderId === provider.id}
            isLast={index === providers.length - 1}
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
