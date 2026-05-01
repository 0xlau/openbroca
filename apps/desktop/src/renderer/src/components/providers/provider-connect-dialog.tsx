import React from 'react'
import type { ProviderConnectionType } from '@openbroca/providers'
import type { LocalModelInstallEvent } from '@openbroca/providers/asr'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import type { ProviderConnectionRecord } from '@renderer/stores/provider-store'
import { trpc } from '@renderer/trpc'
import { trpcClient } from '@renderer/trpc/client'
import type { EditableProviderConnectionOption, ProviderViewModel } from './provider-types'
import { getConnectionOptionByType } from './provider-types'

function isLocalASRProvider(provider: ProviderViewModel): boolean {
  return 'kind' in provider && provider.kind === 'local'
}

function pickRecommendedModelId(
  catalog: ReadonlyArray<{ id: string; recommendedFor?: ReadonlyArray<string> }>,
  locale: string
): string | undefined {
  const lower = locale.toLowerCase()
  const match = catalog.find((entry) =>
    entry.recommendedFor?.some((tag) => lower.startsWith(tag.toLowerCase()))
  )
  return (match ?? catalog[0])?.id
}

function humanBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

function LocalASRConnectPanel({
  providerId,
  onComplete
}: {
  providerId: string
  onComplete: () => void
}) {
  const stateQuery = trpc.providers.localModels.getState.useQuery({ providerId })
  const [installing, setInstalling] = React.useState<{
    modelId: string
    event?: LocalModelInstallEvent
    error?: string
  } | null>(null)
  const cancelMutation = trpc.providers.localModels.cancelInstall.useMutation()

  const startInstall = React.useCallback(
    (modelId: string) => {
      setInstalling({ modelId })
      const subscription = trpcClient.providers.localModels.install.subscribe(
        { providerId, modelId },
        {
          onData: (event: LocalModelInstallEvent) =>
            setInstalling((prev) => (prev ? { ...prev, event } : prev)),
          onComplete: () => {
            setInstalling(null)
            void stateQuery.refetch()
            onComplete()
          },
          onError: (err: Error) => {
            setInstalling((prev) =>
              prev ? { modelId: prev.modelId, error: err.message } : prev
            )
          }
        }
      )
      return subscription
    },
    [providerId, stateQuery, onComplete]
  )

  const handleCancel = () => {
    cancelMutation.mutate({ providerId })
    setInstalling(null)
  }

  const data = stateQuery.data
  if (stateQuery.isError) {
    return (
      <TypographyMuted className="text-sm text-destructive">
        Failed to load catalog: {stateQuery.error?.message ?? 'unknown error'}
      </TypographyMuted>
    )
  }
  if (stateQuery.isLoading || !data) {
    return <TypographyMuted className="text-sm">Loading catalog…</TypographyMuted>
  }

  const recommendedId = pickRecommendedModelId(data.catalogModels, navigator.language ?? 'en')
  const installedIds = new Set(data.installedModels.map((m: { id: string }) => m.id))
  const available = data.catalogModels.filter((m: { id: string }) => !installedIds.has(m.id))

  if (installing) {
    const event = installing.event
    const phase = event?.phase ?? 'downloading'
    const progress =
      event?.phase === 'downloading' && event.totalBytes > 0
        ? Math.floor((event.downloadedBytes / event.totalBytes) * 100)
        : null

    return (
      <div className="space-y-3 rounded-xl border border-foreground/15 bg-muted/30 p-4">
        <TypographySmall>Installing {installing.modelId}</TypographySmall>
        <TypographyMuted className="text-xs capitalize">{phase}</TypographyMuted>
        {progress != null ? (
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full bg-foreground transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
        {installing.error ? (
          <TypographyMuted className="text-xs text-destructive">
            {installing.error}
          </TypographyMuted>
        ) : null}
        <div>
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (available.length === 0 && data.installedModels.length > 0) {
    return (
      <div className="rounded-xl border border-foreground/15 bg-muted/30 p-4">
        <TypographyMuted className="text-sm">
          All catalog models are installed. Use Settings to switch the active model.
        </TypographyMuted>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TypographySmall>Choose a model to download</TypographySmall>
      <ul className="-mr-1 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {available.map((model: { id: string; name: string; sizeBytes: number; description?: string }) => (
          <li
            key={model.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-foreground/10 px-3 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{model.name}</span>
                {model.id === recommendedId ? (
                  <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-xs">
                    Recommended
                  </span>
                ) : null}
              </div>
              <TypographyMuted className="truncate text-xs">
                {humanBytes(model.sizeBytes)}
                {model.description ? ` · ${model.description}` : ''}
              </TypographyMuted>
            </div>
            <Button type="button" className="shrink-0" onClick={() => startInstall(model.id)}>
              Download
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function sanitizeConfig(
  option: EditableProviderConnectionOption,
  values: Record<string, string>
): Record<string, string> | undefined {
  const entries = option.fields
    .map((field) => {
      const raw = values[field.key] ?? ''
      const value = raw.trim()
      return value ? [field.key, value] : null
    })
    .filter((entry): entry is [string, string] => entry !== null)

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

function buildInitialValues(
  option: EditableProviderConnectionOption | undefined,
  currentSetting?: ProviderConnectionRecord,
  previousValues: Record<string, string> = {}
): Record<string, string> {
  if (!option) {
    return previousValues
  }

  const nextValues = { ...previousValues }
  const persistedConfig =
    currentSetting?.connectionType === 'oauth' ? undefined : (currentSetting?.config ?? {})

  for (const field of option.fields) {
    nextValues[field.key] = previousValues[field.key] ?? persistedConfig?.[field.key] ?? ''
  }

  return nextValues
}

function isOptionComplete(
  option: EditableProviderConnectionOption | undefined,
  values: Record<string, string>
): boolean {
  if (!option) {
    return false
  }

  return option.fields.every((field) => {
    if (!field.required) {
      return true
    }

    return (values[field.key] ?? '').trim().length > 0
  })
}

function ConnectionMethodPicker({
  options,
  selectedType,
  onSelect
}: {
  options: ProviderViewModel['connectionOptions']
  selectedType: ProviderConnectionType
  onSelect: (next: ProviderConnectionType) => void
}) {
  if (options.length <= 1) {
    return null
  }

  return (
    <div className="space-y-2">
      <TypographySmall>Connection Method</TypographySmall>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.type}
            variant={option.type === selectedType ? 'secondary' : 'ghost'}
            onClick={() => onSelect(option.type)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function OAuthPanel({
  description,
  buttonLabel,
  isConnecting,
  onConnect
}: {
  description?: string
  buttonLabel?: string
  isConnecting: boolean
  onConnect: () => Promise<void>
}) {
  return (
    <div className="rounded-xl border border-dashed border-foreground/15 bg-muted/30 p-4">
      <TypographyMuted className="text-sm">
        {description ?? 'This provider uses OAuth to authorize access.'}
      </TypographyMuted>
      <TypographyMuted className="mt-3 text-xs">
        Authentication happens in your browser. OpenBroca only uses the non-sensitive connection
        status returned by the main process.
      </TypographyMuted>
      <div className="mt-4">
        <Button onClick={() => void onConnect()} disabled={isConnecting}>
          {buttonLabel ?? 'Continue with OAuth'}
        </Button>
      </div>
    </div>
  )
}

function ConnectionFields({
  option,
  values,
  onChange
}: {
  option: EditableProviderConnectionOption
  values: Record<string, string>
  onChange: (fieldKey: string, value: string) => void
}) {
  return (
    <div className="space-y-4">
      {option.description ? (
        <TypographyMuted className="text-sm">{option.description}</TypographyMuted>
      ) : null}
      {option.fields.map((field) => {
        const inputId = `provider-field-${field.key}`
        const inputType =
          field.input === 'password' ? 'password' : field.input === 'url' ? 'url' : 'text'

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={inputId}>{field.label}</Label>
            <Input
              id={inputId}
              type={inputType}
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
            {field.description ? (
              <TypographyMuted className="text-xs">{field.description}</TypographyMuted>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function ProviderConnectDialog({
  provider,
  currentSetting,
  open,
  onOpenChange,
  onSave,
  onOAuthConnect
}: {
  provider: ProviderViewModel | null
  currentSetting?: ProviderConnectionRecord
  open: boolean
  onOpenChange: (next: boolean) => void
  onSave: (
    providerId: string,
    connectionType: Extract<ProviderConnectionType, 'apiKey' | 'local'>,
    config?: Record<string, string>
  ) => Promise<void>
  onOAuthConnect: (providerId: string) => Promise<void>
}) {
  const [selectedType, setSelectedType] = React.useState<ProviderConnectionType>('apiKey')
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = React.useState(false)
  const [isConnecting, setIsConnecting] = React.useState(false)

  React.useEffect(() => {
    if (!open || !provider) {
      return
    }

    const preferredType =
      currentSetting?.connectionType &&
      getConnectionOptionByType(provider, currentSetting.connectionType)
        ? currentSetting.connectionType
        : provider.connectionOptions[0]?.type

    if (!preferredType) {
      return
    }

    const option = getConnectionOptionByType(provider, preferredType)
    setSelectedType(preferredType)
    setValues(buildInitialValues(option?.type === 'oauth' ? undefined : option, currentSetting))
  }, [currentSetting, open, provider])

  const selectedOption = getConnectionOptionByType(provider, selectedType)
  const editableOption = selectedOption?.type === 'oauth' ? undefined : selectedOption

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!provider || !editableOption) {
      return
    }

    const config = sanitizeConfig(editableOption, values)

    setIsSaving(true)
    try {
      await onSave(provider.id, editableOption.type, config)
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleOAuthConnect() {
    if (!provider || selectedOption?.type !== 'oauth') {
      return
    }

    setIsConnecting(true)
    try {
      await onOAuthConnect(provider.id)
      onOpenChange(false)
    } finally {
      setIsConnecting(false)
    }
  }

  function handleSelect(nextType: ProviderConnectionType) {
    if (!provider) {
      return
    }

    const nextOption = getConnectionOptionByType(provider, nextType)
    setSelectedType(nextType)
    setValues(
      buildInitialValues(
        nextOption?.type === 'oauth' ? undefined : nextOption,
        currentSetting,
        values
      )
    )
  }

  const isLocalASR = !!provider && isLocalASRProvider(provider)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col">
        {provider ? (
          isLocalASR ? (
            <div className="flex min-h-0 flex-col gap-6">
              <DialogHeader>
                <DialogTitle>Connect {provider.displayName}</DialogTitle>
                <DialogDescription>
                  Pick a model to download. Files are stored under the app data folder by default
                  and can be relocated under Settings → Advanced.
                </DialogDescription>
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col">
                <LocalASRConnectPanel
                  providerId={provider.id}
                  onComplete={() => onOpenChange(false)}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Connect {provider.displayName}</DialogTitle>
                <DialogDescription>
                  Choose the connection method this provider supports, then save the configuration
                  to enable it in OpenBroca.
                </DialogDescription>
              </DialogHeader>

              <ConnectionMethodPicker
                options={provider.connectionOptions}
                selectedType={selectedType}
                onSelect={handleSelect}
              />

              {selectedOption?.type === 'oauth' ? (
                <OAuthPanel
                  description={selectedOption.description}
                  buttonLabel={selectedOption.buttonLabel}
                  isConnecting={isConnecting}
                  onConnect={handleOAuthConnect}
                />
              ) : null}
              {editableOption ? (
                <ConnectionFields
                  option={editableOption}
                  values={values}
                  onChange={(fieldKey, value) =>
                    setValues((current) => ({ ...current, [fieldKey]: value }))
                  }
                />
              ) : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                {editableOption ? (
                  <Button
                    type="submit"
                    disabled={!isOptionComplete(editableOption, values) || isSaving}
                  >
                    Save Connection
                  </Button>
                ) : null}
              </DialogFooter>
            </form>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
