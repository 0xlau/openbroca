import React from 'react'
import type { LocalModelInstallEvent } from '@openbroca/providers/asr'
import {
  Button,
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import { trpc } from '@renderer/trpc'
import { trpcClient } from '@renderer/trpc/client'
import type {
  ProviderSettingsItemViewModel,
  ProviderViewModel
} from './provider-types'

function humanBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

function LocalModelSettingsPanel({
  providerId,
  onClose
}: {
  providerId: string
  onClose: () => void
}) {
  const stateQuery = trpc.providers.localModels.getState.useQuery({ providerId })
  const selectMutation = trpc.providers.localModels.select.useMutation({
    onSuccess: () => stateQuery.refetch()
  })
  const removeMutation = trpc.providers.localModels.remove.useMutation({
    onSuccess: () => stateQuery.refetch()
  })
  const changeDirMutation = trpc.providers.localModels.changeDirectory.useMutation({
    onSuccess: () => stateQuery.refetch()
  })
  const cancelMutation = trpc.providers.localModels.cancelInstall.useMutation()
  const [installing, setInstalling] = React.useState<{
    modelId: string
    event?: LocalModelInstallEvent
    error?: string
  } | null>(null)
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [pendingDir, setPendingDir] = React.useState<string>('')

  const data = stateQuery.data
  React.useEffect(() => {
    if (data?.modelDir) setPendingDir(data.modelDir)
  }, [data?.modelDir])

  const startInstall = (modelId: string) => {
    setInstalling({ modelId })
    trpcClient.providers.localModels.install.subscribe(
      { providerId, modelId },
      {
        onData: (event: LocalModelInstallEvent) =>
          setInstalling((prev) => (prev ? { ...prev, event } : prev)),
        onComplete: () => {
          setInstalling(null)
          void stateQuery.refetch()
        },
        onError: (err: Error) => {
          setInstalling((prev) =>
            prev ? { modelId: prev.modelId, error: err.message } : prev
          )
        }
      }
    )
  }

  const handleCancelInstall = () => {
    cancelMutation.mutate({ providerId })
    setInstalling(null)
  }

  if (stateQuery.isError) {
    return (
      <TypographyMuted className="text-sm text-destructive">
        Failed to load models: {stateQuery.error?.message ?? 'unknown error'}
      </TypographyMuted>
    )
  }
  if (stateQuery.isLoading || !data) {
    return <TypographyMuted className="text-sm">Loading models…</TypographyMuted>
  }

  const installedIds = new Set(data.installedModels.map((m: { id: string }) => m.id))
  const notInstalledCatalog = data.catalogModels.filter(
    (m: { id: string }) => !installedIds.has(m.id)
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {installing ? (
        <div className="shrink-0 space-y-3 rounded-xl border border-foreground/15 bg-muted/30 p-4">
          <TypographySmall>Installing {installing.modelId}</TypographySmall>
          <TypographyMuted className="text-xs capitalize">
            {installing.event?.phase ?? 'downloading'}
          </TypographyMuted>
          {installing.event?.phase === 'downloading' &&
          installing.event.totalBytes > 0 ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full bg-foreground transition-[width]"
                style={{
                  width: `${Math.floor((installing.event.downloadedBytes / installing.event.totalBytes) * 100)}%`
                }}
              />
            </div>
          ) : null}
          {installing.error ? (
            <TypographyMuted className="text-xs text-destructive">
              {installing.error}
            </TypographyMuted>
          ) : null}
          <div>
            <Button type="button" variant="ghost" onClick={handleCancelInstall}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
        <section className="space-y-2">
          <TypographySmall>Installed models</TypographySmall>
          {data.installedModels.length === 0 ? (
            <TypographyMuted className="text-xs">No models installed yet.</TypographyMuted>
          ) : (
            <ul className="space-y-2">
              {data.installedModels.map((model: { id: string; name: string; sizeBytes?: number }) => {
                const isActive = data.selectedModelId === model.id
                return (
                  <li
                    key={model.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-foreground/10 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="radio"
                        name={`local-model-${providerId}`}
                        checked={isActive}
                        disabled={selectMutation.isPending}
                        onChange={() =>
                          selectMutation.mutate({ providerId, modelId: model.id })
                        }
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{model.name}</span>
                        {model.sizeBytes != null ? (
                          <TypographyMuted className="text-xs">
                            {humanBytes(model.sizeBytes)}
                          </TypographyMuted>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="shrink-0"
                      disabled={isActive || removeMutation.isPending}
                      onClick={() =>
                        removeMutation.mutate({ providerId, modelId: model.id })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {notInstalledCatalog.length > 0 ? (
          <section className="space-y-2">
            <TypographySmall>More models</TypographySmall>
            <ul className="space-y-2">
              {notInstalledCatalog.map(
                (model: { id: string; name: string; sizeBytes: number; description?: string }) => (
                  <li
                    key={model.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-foreground/10 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{model.name}</span>
                      <TypographyMuted className="truncate text-xs">
                        {humanBytes(model.sizeBytes)}
                        {model.description ? ` · ${model.description}` : ''}
                      </TypographyMuted>
                    </div>
                    <Button
                      type="button"
                      className="shrink-0"
                      disabled={installing != null}
                      onClick={() => startInstall(model.id)}
                    >
                      Download
                    </Button>
                  </li>
                )
              )}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>
          {showAdvanced ? (
            <div className="space-y-2 rounded-lg border border-dashed border-foreground/15 p-3">
              <Label htmlFor={`local-model-dir-${providerId}`}>Model directory</Label>
              <Input
                id={`local-model-dir-${providerId}`}
                value={pendingDir}
                onChange={(event) => setPendingDir(event.target.value)}
              />
              <TypographyMuted className="text-xs">
                Changing the directory rescans for installed models and clears the active selection.
              </TypographyMuted>
              <Button
                type="button"
                variant="ghost"
                disabled={!pendingDir.trim() || pendingDir === data.modelDir || changeDirMutation.isPending}
                onClick={() =>
                  changeDirMutation.mutate({ providerId, modelDir: pendingDir.trim() })
                }
              >
                Change directory
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <DialogFooter className="shrink-0">
        <Button type="button" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

type SettingsValue = string | boolean
type SettingsValues = Record<string, SettingsValue>

function toInitialValues(
  provider: ProviderViewModel | null,
  currentSettings: Record<string, unknown> | undefined
): SettingsValues {
  if (!provider) {
    return {}
  }

  return Object.fromEntries(
    provider.settingsItems.map((item) => {
      const currentValue = currentSettings?.[item.key]

      if (item.type === 'toggle') {
        const value =
          typeof currentValue === 'boolean'
            ? currentValue
            : (item.defaultValue ?? false)
        return [item.key, value]
      }

      return [item.key, typeof currentValue === 'string' ? currentValue : '']
    })
  )
}

function isSelectItem(
  item: ProviderSettingsItemViewModel
): item is Extract<ProviderSettingsItemViewModel, { type: 'select' }> {
  return item.type === 'select'
}

function isTextLikeItem(
  item: ProviderSettingsItemViewModel
): item is Extract<ProviderSettingsItemViewModel, { type: 'text' | 'password' }> {
  return item.type === 'text' || item.type === 'password'
}

function isModelSelectItem(
  item: ProviderSettingsItemViewModel
): item is Extract<ProviderSettingsItemViewModel, { type: 'model-select' }> {
  return item.type === 'model-select'
}

function normalizeSettingsValue(item: ProviderSettingsItemViewModel, value: SettingsValue) {
  if (item.type === 'toggle') {
    return typeof value === 'boolean' ? value : undefined
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function canSaveSettings(
  provider: ProviderViewModel | null,
  values: SettingsValues,
  modelsLoading: boolean,
  modelsError: unknown,
  models: Array<{ id: string; name: string }> | undefined
): boolean {
  if (!provider) {
    return false
  }

  return provider.settingsItems.every((item) => {
    const value = normalizeSettingsValue(item, values[item.key] ?? '')

    if (isModelSelectItem(item)) {
      if (item.allowCustomValue) {
        if (!item.required && value === undefined) {
          return true
        }

        return typeof value === 'string'
      }

      if (modelsLoading || modelsError || !models?.length) {
        return false
      }

      if (!item.required && value === undefined) {
        return true
      }

      return typeof value === 'string' && models.some((model) => model.id === value)
    }

    if (item.required) {
      return value !== undefined
    }

    return true
  })
}

function SettingsField({
  item,
  inputId,
  value,
  modelOptions,
  portalContainer,
  modelsLoading,
  modelsError,
  fieldError,
  onChange
}: {
  item: ProviderSettingsItemViewModel
  inputId: string
  value: SettingsValue
  modelOptions: Array<{ id: string; name: string }> | undefined
  portalContainer?: HTMLElement | null
  modelsLoading: boolean
  modelsError: unknown
  fieldError?: string
  onChange: (nextValue: SettingsValue) => void
}) {
  const renderDescription = item.description || fieldError
  const modelSearchValue = typeof value === 'string' ? value : ''
  const modelPickerAnchorRef = useComboboxAnchor()
  const selectedModelOption =
    isModelSelectItem(item) && item.allowCustomValue && typeof value === 'string'
      ? (modelOptions?.find((model) => model.id === value) ?? null)
      : null

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{item.label}</Label>
      {isModelSelectItem(item) ? (
        item.allowCustomValue ? (
          <>
            <Combobox
              inline
              items={modelOptions ?? []}
              value={selectedModelOption}
              inputValue={modelSearchValue}
              onValueChange={(nextValue) => onChange(nextValue?.id ?? '')}
              onInputValueChange={(nextValue) => onChange(nextValue)}
              itemToStringLabel={(model) => model.name}
              itemToStringValue={(model) => model.id}
              isItemEqualToValue={(itemValue, selectedValue) => itemValue.id === selectedValue.id}
            >
              <div ref={modelPickerAnchorRef}>
                <ComboboxInput
                  id={inputId}
                  placeholder={`Choose ${item.label.toLowerCase()} or enter a custom value`}
                />
              </div>
              <ComboboxContent
                anchor={modelPickerAnchorRef}
                align="start"
                className="p-2"
                portalContainer={portalContainer}
              >
                <ComboboxEmpty>No matching models.</ComboboxEmpty>
                <ComboboxList className="max-h-[min(50vh,320px)]">
                  <ComboboxCollection>
                    {(model, index) => (
                      <ComboboxItem key={model.id} value={model} index={index}>
                        {model.name}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {modelsLoading ? (
              <TypographyMuted className="text-sm">Loading models...</TypographyMuted>
            ) : modelsError ? (
              <TypographyMuted className="text-sm">
                Unable to load models. Enter a model ID manually.
              </TypographyMuted>
            ) : !modelOptions?.length ? (
              <TypographyMuted className="text-sm">
                No models are available for this provider yet. Enter a model ID manually.
              </TypographyMuted>
            ) : null}
          </>
        ) : (
          <>
            {modelsLoading ? (
              <TypographyMuted className="text-sm">Loading models...</TypographyMuted>
            ) : modelsError ? (
              <TypographyMuted className="text-sm">Unable to load models.</TypographyMuted>
            ) : !modelOptions?.length ? (
              <TypographyMuted className="text-sm">
                No models are available for this provider.
              </TypographyMuted>
            ) : (
              <Select
                value={typeof value === 'string' && value ? value : undefined}
                onValueChange={onChange}
              >
                <SelectTrigger id={inputId} className="w-full">
                  <SelectValue placeholder={`Choose ${item.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )
      ) : null}
      {isSelectItem(item) ? (
        <Select value={typeof value === 'string' && value ? value : undefined} onValueChange={onChange}>
          <SelectTrigger id={inputId} className="w-full">
            <SelectValue placeholder={`Choose ${item.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {item.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {isTextLikeItem(item) ? (
        <Input
          id={inputId}
          type={item.type === 'password' ? 'password' : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={item.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      {renderDescription ? (
        <TypographyMuted className="text-xs">{fieldError ?? item.description}</TypographyMuted>
      ) : null}
    </div>
  )
}

export function ProviderSettingsDialog({
  provider,
  section,
  open,
  currentSettings,
  onOpenChange,
  onSave
}: {
  provider: ProviderViewModel | null
  section: 'llm' | 'asr' | null
  open: boolean
  currentSettings?: Record<string, unknown>
  onOpenChange: (next: boolean) => void
  onSave: (providerId: string, settings: Record<string, unknown>) => Promise<void>
}) {
  const [values, setValues] = React.useState<SettingsValues>({})
  const [isSaving, setIsSaving] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null)

  React.useLayoutEffect(() => {
    if (!open) {
      setPortalContainer(null)
      return
    }

    setPortalContainer(
      (formRef.current?.closest('[data-slot="dialog-content"]') as HTMLElement | null) ?? null
    )
  }, [open])

  React.useEffect(() => {
    if (!open) {
      return
    }

    setValues(toInitialValues(provider, currentSettings))
  }, [currentSettings, open, provider])

  const { data: setupStatus } = trpc.providers.getSetupStatus.useQuery(
    {
      providerId: provider?.id ?? '',
      kind: section ?? 'llm'
    },
    { enabled: open && !!provider && !!section }
  )

  const hasModelSelect = provider?.settingsItems.some((item) => item.type === 'model-select') ?? false
  const hasLocalModelSelect =
    provider?.settingsItems.some((item) => item.type === 'local-model-select') ?? false
  const { data: models, isLoading: modelsLoading, error: modelsError } = trpc.providers.listModels.useQuery(
    { providerId: provider?.id ?? '' },
    { enabled: open && !!provider && section === 'llm' && hasModelSelect }
  )

  const canSave = !isSaving && canSaveSettings(provider, values, modelsLoading, modelsError, models)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!provider || !canSave) {
      return
    }

    const nextSettings = Object.fromEntries(
      provider.settingsItems
        .map((item) => [item.key, normalizeSettingsValue(item, values[item.key] ?? '')] as const)
        .filter((entry): entry is [string, string | boolean] => entry[1] !== undefined)
    )

    setIsSaving(true)
    try {
      await onSave(provider.id, nextSettings)
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          hasLocalModelSelect
            ? 'flex max-h-[85vh] max-w-lg flex-col'
            : 'max-w-lg'
        }
      >
        {provider ? (
          hasLocalModelSelect ? (
            <div ref={formRef as unknown as React.RefObject<HTMLDivElement>} className="flex min-h-0 flex-1 flex-col gap-6">
              <DialogHeader>
                <DialogTitle>Settings for {provider.displayName}</DialogTitle>
                <DialogDescription>
                  Switch the active model, download additional models from the catalog, or change
                  where models are stored.
                </DialogDescription>
              </DialogHeader>

              {setupStatus?.summary ? (
                <div className="shrink-0 rounded-xl border border-foreground/10 bg-muted/30 px-4 py-3">
                  <TypographyMuted className="text-sm">{setupStatus.summary}</TypographyMuted>
                </div>
              ) : null}

              <LocalModelSettingsPanel
                providerId={provider.id}
                onClose={() => onOpenChange(false)}
              />
            </div>
          ) : (
            <form ref={formRef} className="space-y-6" onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Settings for {provider.displayName}</DialogTitle>
                <DialogDescription>
                  Save provider-specific settings without changing the current connect or disconnect
                  state.
                </DialogDescription>
              </DialogHeader>

              {setupStatus?.summary ? (
                <div className="rounded-xl border border-foreground/10 bg-muted/30 px-4 py-3">
                  <TypographyMuted className="text-sm">{setupStatus.summary}</TypographyMuted>
                </div>
              ) : null}

              <div className="space-y-4">
                {provider.settingsItems.map((item) => (
                  <SettingsField
                    key={item.key}
                    item={item}
                    inputId={`provider-settings-${provider.id}-${item.key}`}
                    value={values[item.key] ?? ''}
                    modelOptions={models}
                    portalContainer={portalContainer}
                    modelsLoading={modelsLoading}
                    modelsError={modelsError}
                    fieldError={setupStatus?.fieldErrors?.[item.key]}
                    onChange={(nextValue) =>
                      setValues((current) => ({ ...current, [item.key]: nextValue }))
                    }
                  />
                ))}
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSave}>
                  Save settings
                </Button>
              </DialogFooter>
            </form>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
