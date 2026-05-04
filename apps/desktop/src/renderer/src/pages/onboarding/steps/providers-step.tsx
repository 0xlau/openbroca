import React from 'react'
import type { ProviderConnectionType } from '@openbroca/providers'
import { Button, Card, CardDescription, CardHeader, CardTitle } from '@openbroca/ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { useStore } from 'zustand'
import { trpc } from '@renderer/trpc'
import {
  providerStore,
  upsertProviderConnection,
  type ProviderConnectionRecord
} from '@renderer/stores/provider-store'
import { ProviderConnectDialog } from '@renderer/components/providers/provider-connect-dialog'
import { ProviderSettingsDialog } from '@renderer/components/providers/provider-settings-dialog'
import {
  toProviderViewModel,
  type ProviderViewModel
} from '@renderer/components/providers/provider-types'

const FEATURED_LLM_IDS = ['openai', 'openrouter']
const FEATURED_ASR_IDS = ['deepgram', 'sherpa-onnx']

export function useProvidersStepReady(): boolean {
  const { data } = useStore(providerStore)
  return Boolean(data.activeProviders.llm) && Boolean(data.activeProviders.asr)
}

interface OnboardingProviderCardProps {
  provider: ProviderViewModel
  isActive: boolean
  setting: ProviderConnectionRecord | undefined
  onConnect: (p: ProviderViewModel) => void
  onSetActive: (p: ProviderViewModel) => void
  onOpenSettings: (p: ProviderViewModel) => void
}

function OnboardingProviderCard({
  provider,
  isActive,
  setting,
  onConnect,
  onSetActive,
  onOpenSettings
}: OnboardingProviderCardProps): React.ReactElement {
  // OAuth providers (e.g. OpenAI Codex) don't write to setting.providers — their
  // connection state lives in the auth service. Pull it via trpc so the card
  // reacts when the user finishes the browser flow and providerAuth.status
  // gets cached by handleOAuthConnect.
  const oauthOption = provider.connectionOptions?.find((option) => option.type === 'oauth')
  const isOAuthCapable = Boolean(oauthOption)
  const { data: authStatus } = trpc.providerAuth.status.useQuery(
    { providerId: provider.id },
    { enabled: isOAuthCapable }
  )
  const isConnectedViaOAuth = isOAuthCapable && authStatus?.status === 'connected'
  const isConnectedManually = Boolean(setting?.enabled) && setting?.connectionType !== 'oauth'
  const isConnected = isConnectedViaOAuth || isConnectedManually

  const buttonLabel = isActive ? 'Current' : isConnected ? 'Set as active' : 'Connect'

  return (
    <Card data-testid={`onboarding-provider-card-${provider.id}`} className="border-border/80">
      <CardHeader className="flex flex-row items-start justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{provider.displayName}</CardTitle>
          <CardDescription className="text-xs">{provider.description}</CardDescription>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            disabled={isActive}
            variant={isActive ? 'secondary' : 'default'}
            onClick={() => {
              if (isActive) return
              if (isConnected) onSetActive(provider)
              else onConnect(provider)
            }}
          >
            {isActive && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />}
            {buttonLabel}
          </Button>
          {isConnected && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenSettings(provider)}
              data-testid={`onboarding-provider-settings-${provider.id}`}
            >
              Settings
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  )
}

export function ProvidersStep(): React.ReactElement {
  const { data: llmData } = trpc.providers.listLLM.useQuery()
  const { data: asrData } = trpc.providers.listASR.useQuery()
  const { data: settings } = useStore(providerStore)
  const trpcUtils = trpc.useUtils()

  const [selected, setSelected] = React.useState<ProviderViewModel | null>(null)
  const [selectedDomain, setSelectedDomain] = React.useState<'llm' | 'asr' | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [settingsTarget, setSettingsTarget] = React.useState<ProviderViewModel | null>(null)
  const [settingsSection, setSettingsSection] = React.useState<'llm' | 'asr' | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false)
  const [showAllLlm, setShowAllLlm] = React.useState(false)
  const [showAllAsr, setShowAllAsr] = React.useState(false)

  const llmAll: ProviderViewModel[] = (llmData ?? []).map(toProviderViewModel)
  const asrAll: ProviderViewModel[] = (asrData ?? []).map(toProviderViewModel)
  const llmFeatured = llmAll.filter((p) => FEATURED_LLM_IDS.includes(p.id))
  const asrFeatured = asrAll.filter((p) => FEATURED_ASR_IDS.includes(p.id))
  const llmRest = llmAll.filter((p) => !FEATURED_LLM_IDS.includes(p.id))
  const asrRest = asrAll.filter((p) => !FEATURED_ASR_IDS.includes(p.id))

  const activeLlm = settings.activeProviders.llm
  const activeAsr = settings.activeProviders.asr

  function handleConnect(provider: ProviderViewModel, domain: 'llm' | 'asr'): void {
    setSelected(provider)
    setSelectedDomain(domain)
    setIsDialogOpen(true)
  }

  async function handleSetActive(
    provider: ProviderViewModel,
    domain: 'llm' | 'asr'
  ): Promise<void> {
    // OAuth writes providers[id] from the main process and propagates to the
    // renderer asynchronously through trpcClient.store.watch. If we update
    // activeProviders before that subscription has landed, normalizeProviderSettings
    // drops activeProviders[domain] because there's no matching providers[id]
    // entry. Hydrate first so we see the OAuth write.
    await providerStore.getState().hydrate()
    await providerStore.getState().update({
      activeProviders: { [domain]: provider.id }
    })
  }

  function handleOpenSettings(provider: ProviderViewModel, section: 'llm' | 'asr'): void {
    setSettingsTarget(provider)
    setSettingsSection(section)
    setIsSettingsOpen(true)
  }

  async function handleSave(
    providerId: string,
    connectionType: Extract<ProviderConnectionType, 'apiKey' | 'local'>,
    config?: Record<string, string>
  ): Promise<void> {
    await upsertProviderConnection(providerId, {
      enabled: true,
      connectionType,
      config
    })
    // Auto-active: if no active provider in this domain yet, set the new one
    if (selectedDomain && !settings.activeProviders[selectedDomain]) {
      await providerStore.getState().update({
        activeProviders: { ...settings.activeProviders, [selectedDomain]: providerId }
      })
    }
  }

  async function handleOAuthConnect(providerId: string): Promise<void> {
    const status = await window.api.providerAuth.connect(providerId)
    trpcUtils.providerAuth.status.setData({ providerId }, status)
    if (status.status !== 'connected' || !selectedDomain) return

    // Pull the latest providers map from main so the OAuth-side write
    // (enabled + connectionType=oauth) is visible before we update
    // activeProviders. Without this, normalizeProviderSettings drops
    // activeProviders[domain] because no matching providers entry yet.
    await providerStore.getState().hydrate()
    const fresh = providerStore.getState().data
    if (fresh.activeProviders[selectedDomain]) return

    await providerStore.getState().update({
      activeProviders: { [selectedDomain]: providerId }
    })
  }

  async function handleSaveProviderSettings(
    providerId: string,
    nextSettings: Record<string, unknown>
  ): Promise<void> {
    await providerStore.getState().update({
      providerSettings: {
        [providerId]: nextSettings
      }
    })
  }

  const ready = Boolean(activeLlm) && Boolean(activeAsr)

  return (
    <div className="flex w-full flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Providers</h1>
        <p className="text-sm text-muted-foreground">
          Connect at least one LLM and one ASR. You can change them later in Providers.
        </p>
      </div>

      <section className="flex flex-col gap-3" data-testid="onboarding-llm-section">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          LLM Providers
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {llmFeatured.map((p) => (
            <OnboardingProviderCard
              key={p.id}
              provider={p}
              isActive={activeLlm === p.id}
              setting={settings.providers[p.id]}
              onConnect={(prov) => handleConnect(prov, 'llm')}
              onSetActive={(prov) => void handleSetActive(prov, 'llm')}
              onOpenSettings={(prov) => handleOpenSettings(prov, 'llm')}
            />
          ))}
        </div>
        {llmRest.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllLlm((v) => !v)}
            className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            data-testid="onboarding-llm-show-all"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
            {showAllLlm ? 'Show fewer' : 'Show all'}
          </button>
        )}
        {showAllLlm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {llmRest.map((p) => (
              <OnboardingProviderCard
                key={p.id}
                provider={p}
                isActive={activeLlm === p.id}
                setting={settings.providers[p.id]}
                onConnect={(prov) => handleConnect(prov, 'llm')}
                onSetActive={(prov) => void handleSetActive(prov, 'llm')}
                onOpenSettings={(prov) => handleOpenSettings(prov, 'llm')}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="onboarding-asr-section">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          ASR Providers
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {asrFeatured.map((p) => (
            <OnboardingProviderCard
              key={p.id}
              provider={p}
              isActive={activeAsr === p.id}
              setting={settings.providers[p.id]}
              onConnect={(prov) => handleConnect(prov, 'asr')}
              onSetActive={(prov) => void handleSetActive(prov, 'asr')}
              onOpenSettings={(prov) => handleOpenSettings(prov, 'asr')}
            />
          ))}
        </div>
        {asrRest.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllAsr((v) => !v)}
            className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            data-testid="onboarding-asr-show-all"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
            {showAllAsr ? 'Show fewer' : 'Show all'}
          </button>
        )}
        {showAllAsr && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {asrRest.map((p) => (
              <OnboardingProviderCard
                key={p.id}
                provider={p}
                isActive={activeAsr === p.id}
                setting={settings.providers[p.id]}
                onConnect={(prov) => handleConnect(prov, 'asr')}
                onSetActive={(prov) => void handleSetActive(prov, 'asr')}
                onOpenSettings={(prov) => handleOpenSettings(prov, 'asr')}
              />
            ))}
          </div>
        )}
      </section>

      <p
        className={`text-sm ${ready ? 'text-foreground' : 'text-muted-foreground'}`}
        data-testid="onboarding-providers-status"
      >
        {ready
          ? 'Ready. Continue when you’re set.'
          : 'Connect at least one LLM and one ASR to continue.'}
      </p>

      <ProviderConnectDialog
        provider={selected}
        currentSetting={selected ? settings.providers[selected.id] : undefined}
        open={isDialogOpen}
        onOpenChange={(next) => {
          setIsDialogOpen(next)
          if (!next) {
            setSelected(null)
            setSelectedDomain(null)
          }
        }}
        onSave={handleSave}
        onOAuthConnect={handleOAuthConnect}
      />

      <ProviderSettingsDialog
        provider={settingsTarget}
        section={settingsSection}
        currentSettings={settingsTarget ? settings.providerSettings[settingsTarget.id] : undefined}
        open={isSettingsOpen}
        onOpenChange={(next) => {
          setIsSettingsOpen(next)
          if (!next) {
            setSettingsTarget(null)
            setSettingsSection(null)
          }
        }}
        onSave={handleSaveProviderSettings}
      />
    </div>
  )
}
