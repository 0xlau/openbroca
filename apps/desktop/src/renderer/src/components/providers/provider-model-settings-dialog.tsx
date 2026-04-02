import React from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TypographyMuted
} from '@openbroca/ui'
import { trpc } from '@renderer/trpc'
import {
  getLLMModelInputMode,
  hasValidSavedLLMModel,
  type ProviderViewModel
} from './provider-types'

export function ProviderModelSettingsDialog({
  provider,
  open,
  savedModel,
  onOpenChange,
  onSave
}: {
  provider: ProviderViewModel | null
  open: boolean
  savedModel?: string
  onOpenChange: (next: boolean) => void
  onSave: (providerId: string, model: string) => Promise<void>
}) {
  const mode = provider ? getLLMModelInputMode(provider.id) : 'manual'
  const [manualModel, setManualModel] = React.useState(savedModel ?? '')
  const [selectedModel, setSelectedModel] = React.useState(savedModel ?? '')
  const [isSaving, setIsSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open || !provider) {
      return
    }

    const nextModel = savedModel ?? ''
    setManualModel(nextModel)
    setSelectedModel(nextModel)
  }, [open, provider, savedModel])

  const { data: models, isLoading, error } = trpc.providers.listModels.useQuery(
    { providerId: provider?.id ?? '' },
    { enabled: open && !!provider && mode === 'select' }
  )

  React.useEffect(() => {
    if (!open || !provider || mode !== 'select' || !models) {
      return
    }

    if (selectedModel && !hasValidSavedLLMModel(provider.id, selectedModel, models)) {
      setSelectedModel('')
    }
  }, [mode, models, open, provider, selectedModel])

  const manualCandidate = manualModel.trim()
  const selectedCandidate = selectedModel.trim()
  const hasValidSelectedModel =
    !!provider && hasValidSavedLLMModel(provider.id, selectedCandidate, models)
  const canSave =
    !!provider &&
    !isSaving &&
    (mode === 'manual' ? manualCandidate.length > 0 : hasValidSelectedModel) &&
    (mode === 'manual' || (!!models?.length && !isLoading && !error))

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!provider) {
      return
    }

    const model = mode === 'manual' ? manualCandidate : selectedCandidate
    if (!model) {
      return
    }

    setIsSaving(true)
    try {
      await onSave(provider.id, model)
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {provider ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Model settings for {provider.displayName}</DialogTitle>
              <DialogDescription>
                Save the model used by this provider. This does not set the provider as active.
              </DialogDescription>
            </DialogHeader>

            {mode === 'select' ? (
              <div className="space-y-2">
                <Label htmlFor="provider-model-select">Model</Label>
                {isLoading ? (
                  <TypographyMuted className="text-sm">Loading models...</TypographyMuted>
                ) : error ? (
                  <TypographyMuted className="text-sm">Unable to load models.</TypographyMuted>
                ) : !models?.length ? (
                  <TypographyMuted className="text-sm">
                    No models are available for this provider.
                  </TypographyMuted>
                ) : (
                  <Select value={selectedModel || undefined} onValueChange={setSelectedModel}>
                    <SelectTrigger id="provider-model-select" className="w-full">
                      <SelectValue placeholder="Choose a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="provider-model-name">Model name</Label>
                <Input
                  id="provider-model-name"
                  value={manualModel}
                  onChange={(event) => setManualModel(event.target.value)}
                  placeholder="Enter model id"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave}>
                Save model
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
