import React from 'react'
import type { ProviderConnectionType } from '@openbroca/providers'
import { Separator, TypographyH3, TypographyMuted } from '@openbroca/ui'
import { trpc } from '@renderer/trpc'
import { useStore } from 'zustand'
import { removeProviderState } from '../../../../shared/provider-auth'
import {
  providerStore,
  upsertProviderConnection,
  type ProviderSettings
} from '@renderer/stores/provider-store'
import { ProviderConnectDialog } from '@renderer/components/providers/provider-connect-dialog'
import { ProviderModelSettingsDialog } from '@renderer/components/providers/provider-model-settings-dialog'
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
} {
  const { data: llmData } = trpc.providers.listLLM.useQuery()
  const { data: asrData } = trpc.providers.listASR.useQuery()
  const { data: settings, isHydrated } = useStore(providerStore)

  const isLoading = !isHydrated || llmData === undefined || asrData === undefined

  const llmProviders: ProviderViewModel[] = (llmData ?? []).map(toProviderViewModel)

  const asrProviders: ProviderViewModel[] = (asrData ?? []).map(toProviderViewModel)

  return {
    llmProviders,
    asrProviders,
    isLoading,
    settings
  }
}

function ProviderContainer() {
  const { llmProviders, asrProviders, isLoading, settings } = useProviderViewModel()
  const trpcUtils = trpc.useUtils()
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderViewModel | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [selectedModelProvider, setSelectedModelProvider] = React.useState<ProviderViewModel | null>(
    null
  )
  const [isModelDialogOpen, setIsModelDialogOpen] = React.useState(false)

  async function handleSave(
    providerId: string,
    connectionType: Extract<ProviderConnectionType, 'apiKey' | 'local'>,
    config?: Record<string, string>
  ) {
    await upsertProviderConnection(providerId, {
      enabled: true,
      connectionType,
      config
    })
  }

  async function handleOAuthConnect(providerId: string) {
    const status = await window.api.providerAuth.connect(providerId)
    trpcUtils.providerAuth.status.setData({ providerId }, status)
  }

  function getSavedModel(providerId: string): string | undefined {
    const entry = settings.providerSettings[providerId]
    const candidate = entry?.model
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined
  }

  async function handleSaveModelSelection(providerId: string, model: string) {
    await providerStore.getState().update({
      providerSettings: {
        [providerId]: { model }
      }
    })
  }

  async function handleSetActive(section: 'llm' | 'asr', providerId: string) {
    if (section === 'llm') {
      const model = getSavedModel(providerId)
      if (!model) {
        return
      }

      await providerStore.getState().update({
        activeProviders: { llm: providerId }
      })
      return
    }

    await providerStore.getState().update({
      activeProviders: { asr: providerId }
    })
  }

  async function handleDisconnect(
    section: 'llm' | 'asr',
    providerId: string,
    connectionType: ProviderConnectionType
  ) {
    void section
    if (connectionType === 'oauth') {
      const status = await window.api.providerAuth.disconnect(providerId)
      trpcUtils.providerAuth.status.setData({ providerId }, status)
      return
    }

    const current = providerStore.getState().data
    await providerStore.getState().replace(removeProviderState(current, providerId))
  }

  function handleConnect(provider: ProviderViewModel) {
    setSelectedProvider(provider)
    setIsDialogOpen(true)
  }

  function handleOpenModelSettings(provider: ProviderViewModel) {
    setSelectedModelProvider(provider)
    setIsModelDialogOpen(true)
  }

  if (isLoading) {
    return <TypographyMuted>Loading providers...</TypographyMuted>
  }

  return (
    <>
      <div className="space-y-8">
        <ProviderSection
          section="asr"
          title="ASR Providers"
          providers={asrProviders}
          settings={settings.providers}
          providerSettings={settings.providerSettings}
          activeProviderId={settings.activeProviders.asr}
          onConnect={handleConnect}
          onOpenModelSettings={handleOpenModelSettings}
          onSetActive={handleSetActive}
          onDisconnect={handleDisconnect}
        />
        <Separator />
        <ProviderSection
          section="llm"
          title="LLM Providers"
          providers={llmProviders}
          settings={settings.providers}
          providerSettings={settings.providerSettings}
          activeProviderId={settings.activeProviders.llm}
          onConnect={handleConnect}
          onOpenModelSettings={handleOpenModelSettings}
          onSetActive={handleSetActive}
          onDisconnect={handleDisconnect}
        />
      </div>

      <ProviderConnectDialog
        provider={selectedProvider}
        currentSetting={selectedProvider ? settings.providers[selectedProvider.id] : undefined}
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

      <ProviderModelSettingsDialog
        provider={selectedModelProvider}
        savedModel={selectedModelProvider ? getSavedModel(selectedModelProvider.id) : undefined}
        open={isModelDialogOpen}
        onOpenChange={(next) => {
          setIsModelDialogOpen(next)
          if (!next) {
            setSelectedModelProvider(null)
          }
        }}
        onSave={handleSaveModelSelection}
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
          Connect multiple providers, then choose which one each pipeline uses.
        </TypographyMuted>
      </div>
      <ProviderContainer />
    </div>
  )
}
