import React from 'react'
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
  TypographyMuted
} from '@openbroca/ui'
import { trpc } from '@renderer/trpc'
import type {
  ProviderSettingsItemViewModel,
  ProviderViewModel
} from './provider-types'

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
      <DialogContent className="max-w-lg">
        {provider ? (
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
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
