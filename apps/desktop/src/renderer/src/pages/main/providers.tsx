import React from 'react'
import type { ProviderConnectionType } from '@openbroca/providers'
import { Separator, TypographyH3, TypographyMuted } from '@openbroca/ui'
import { trpc } from '@renderer/trpc'
import { useStore } from 'zustand'
import { providerStore, type ProviderSettings } from '@renderer/stores/provider-store'
import { ProviderConnectDialog } from '@renderer/components/providers/provider-connect-dialog'
import { ProviderSection } from '@renderer/components/providers/provider-section'
import {
  toProviderViewModel,
  type ProviderViewModel
} from '@renderer/components/providers/provider-types'

function useProviderViewModel(): {
  llmProviders: ProviderViewModel[]
  asrProviders: ProviderViewModel[]
  isLoading: boolean
  settings: ProviderSettings
  updateSettings: (partial: Partial<ProviderSettings>) => Promise<void>
  replaceSettings: (next: ProviderSettings) => Promise<void>
} {
  const { data: llmData } = trpc.providers.listLLM.useQuery()
  const { data: asrData } = trpc.providers.listASR.useQuery()
  const { data: settings, isHydrated, update, replace } = useStore(providerStore)

  const isLoading = !isHydrated || llmData === undefined || asrData === undefined

  const llmProviders: ProviderViewModel[] = (llmData ?? []).map(toProviderViewModel)

  const asrProviders: ProviderViewModel[] = (asrData ?? []).map(toProviderViewModel)

  return {
    llmProviders,
    asrProviders,
    isLoading,
    settings,
    updateSettings: update,
    replaceSettings: replace
  }
}

function ProviderContainer() {
  const { llmProviders, asrProviders, isLoading, settings, updateSettings, replaceSettings } =
    useProviderViewModel()
  const trpcUtils = trpc.useUtils()
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderViewModel | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  async function handleSave(
    providerId: string,
    connectionType: Extract<ProviderConnectionType, 'apiKey' | 'local'>,
    config?: Record<string, string>
  ) {
    await updateSettings({
      [providerId]: {
        enabled: true,
        connectionType,
        config
      }
    })
  }

  async function handleOAuthConnect(providerId: string) {
    const status = await window.api.providerAuth.connect(providerId)
    trpcUtils.providerAuth.status.setData({ providerId }, status)
  }

  async function handleDisconnect(providerId: string, connectionType: ProviderConnectionType) {
    if (connectionType === 'oauth') {
      const status = await window.api.providerAuth.disconnect(providerId)
      trpcUtils.providerAuth.status.setData({ providerId }, status)
      return
    }

    const nextSettings = { ...settings }
    delete nextSettings[providerId]
    await replaceSettings(nextSettings)
  }

  function handleConnect(provider: ProviderViewModel) {
    setSelectedProvider(provider)
    setIsDialogOpen(true)
  }

  if (isLoading) {
    return <TypographyMuted>Loading providers...</TypographyMuted>
  }

  return (
    <>
      <div className="space-y-8">
        <ProviderSection
          title="ASR Providers"
          providers={asrProviders}
          settings={settings}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
        <Separator />
        <ProviderSection
          title="LLM Providers"
          providers={llmProviders}
          settings={settings}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      </div>

      <ProviderConnectDialog
        provider={selectedProvider}
        currentSetting={selectedProvider ? settings[selectedProvider.id] : undefined}
        open={isDialogOpen}
        onOAuthConnect={handleOAuthConnect}
        onOpenChange={(next) => {
          setIsDialogOpen(next)
          if (!next) {
            setSelectedProvider(null)
          }
        }}
        onSave={handleSave}
      />
    </>
  )
}

export const Providers: React.FC = () => {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
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
