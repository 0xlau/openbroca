import React from 'react'
import {
  Badge,
  Button,
  Separator,
  TypographyH3,
  TypographyLarge,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { trpc } from '@renderer/trpc'
import { useStore } from 'zustand'
import { providerStore } from '@renderer/stores/provider-store'

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

interface ProviderViewModel {
  id: string
  displayName: string
  description: string
  kind?: 'cloud' | 'local'
  configured: boolean
  icon?: string
}

function useProviderViewModel(): {
  llmProviders: ProviderViewModel[]
  asrProviders: ProviderViewModel[]
  isLoading: boolean
} {
  const { data: llmData } = trpc.providers.listLLM.useQuery()
  const { data: asrData } = trpc.providers.listASR.useQuery()
  const { data: settings, isHydrated } = useStore(providerStore)

  const isLoading = !isHydrated || llmData === undefined || asrData === undefined

  const llmProviders: ProviderViewModel[] = (llmData ?? []).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    description: p.description,
    configured: !!settings[p.id]?.enabled,
    icon: p.icon ?? undefined
  }))

  const asrProviders: ProviderViewModel[] = (asrData ?? []).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    description: p.description,
    kind: p.kind as 'cloud' | 'local',
    configured: !!settings[p.id]?.enabled,
    icon: p.icon ?? undefined
  }))

  return { llmProviders, asrProviders, isLoading }
}

function ProviderRow({ provider, isLast }: { provider: ProviderViewModel; isLast: boolean }) {
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
            {provider.kind === 'local' && (
              <Badge variant="secondary" className="text-xs">
                Local
              </Badge>
            )}
          </div>
          <TypographyMuted className="mt-1 truncate text-xs">
            {provider.description}
          </TypographyMuted>
        </div>
        <Button
          variant={provider.configured ? 'ghost' : 'secondary'}
          size="sm"
          className="shrink-0 gap-1.5"
        >
          {provider.configured ? null : <HugeiconsIcon icon={PlusSignIcon} size={14} />}
          {provider.configured ? 'Disconnect' : 'Connect'}
        </Button>
      </div>
      {!isLast && <Separator />}
    </>
  )
}

function ProviderSection({ title, providers }: { title: string; providers: ProviderViewModel[] }) {
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
            isLast={index === providers.length - 1}
          />
        ))}
      </div>
    </section>
  )
}

function ProviderContainer() {
  const { llmProviders, asrProviders } = useProviderViewModel()

  return (
    <div className="space-y-8">
      <ProviderSection title="ASR Providers" providers={asrProviders} />
      <Separator />
      <ProviderSection title="LLM Providers" providers={llmProviders} />
    </div>
  )
}

export const Providers: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <TypographyH3 className="text-left">Providers</TypographyH3>
        <TypographyMuted className="not-first:mt-2">
          Manage API credentials for ASR and LLM Providers.
        </TypographyMuted>
      </div>
      <ProviderContainer />
    </div>
  )
}
