import React from 'react'
import type { ProviderConnectionType } from '@openbroca/providers'
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
import type { EditableProviderConnectionOption, ProviderViewModel } from './provider-types'
import { getConnectionOptionByType } from './provider-types'

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {provider ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Connect {provider.displayName}</DialogTitle>
              <DialogDescription>
                Choose the connection method this provider supports, then save the configuration to
                enable it in OpenBroca.
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
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
