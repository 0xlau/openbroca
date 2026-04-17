import React from 'react'
import { Button, CardContent, Textarea, TypographyH3, TypographyMuted } from '@openbroca/ui'
import { promptsStore, defaultPromptTemplateText } from '@renderer/stores/prompts-store'
import { useStore } from 'zustand'

function resolveTemplateValue(template: string): string {
  return template.trim().length > 0 ? template : defaultPromptTemplateText
}

function normalizeTemplateForPersistence(template: string): string {
  return template.trim().length > 0 ? template : ''
}

export const Prompts: React.FC = () => {
  const { data: savedPrompts, isHydrated, update } = useStore(promptsStore)
  const lastSyncedTemplateRef = React.useRef<string>(
    resolveTemplateValue(promptsStore.getState().data.template)
  )
  const [isSaving, setIsSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const persistedTemplate = React.useMemo(
    () => resolveTemplateValue(savedPrompts.template),
    [savedPrompts.template]
  )
  const [template, setTemplate] = React.useState(persistedTemplate)

  React.useEffect(() => {
    if (!isHydrated) {
      return
    }

    // Only sync editor text when there are no local unsaved edits.
    if (template !== lastSyncedTemplateRef.current) {
      return
    }

    setTemplate(persistedTemplate)
  }, [isHydrated, persistedTemplate, template])

  const isDirty = isHydrated && template !== persistedTemplate

  React.useEffect(() => {
    if (!isHydrated || isSaving || isDirty) {
      return
    }

    lastSyncedTemplateRef.current = persistedTemplate
  }, [isHydrated, isDirty, isSaving, persistedTemplate])

  async function saveChanges() {
    if (!isDirty || isSaving) {
      return
    }

    const nextPersistedTemplate = normalizeTemplateForPersistence(template)
    const nextResolvedTemplate = resolveTemplateValue(nextPersistedTemplate)

    setIsSaving(true)
    setSaveError(null)

    try {
      await update({ template: nextPersistedTemplate })
      setTemplate(nextResolvedTemplate)
      setSaveError(null)
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save prompt template. Please try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void saveChanges()
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TypographyH3 className="text-left">Prompts</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Edit the full prompt template used for transcript post-processing.
          </TypographyMuted>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTemplate(defaultPromptTemplateText)
              if (saveError) {
                setSaveError(null)
              }
            }}
          >
            Use default template
          </Button>
          {isDirty ? (
            <Button type="submit" disabled={isSaving}>
              Save changes
            </Button>
          ) : null}
        </div>
      </div>

      <CardContent className="space-y-2 px-0">
        {saveError ? (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        ) : null}
        <Textarea
          id="prompt-template-editor"
          value={template}
          className="min-h-80 font-mono"
          onChange={(event) => {
            setTemplate(event.target.value)
            if (saveError) {
              setSaveError(null)
            }
          }}
        />
        <TypographyMuted className="text-xs">
          You can use {'{{dictionary}}'}, {'{{about_me}}'}, and {'{{matched_instructions}}'} in
          the template.
        </TypographyMuted>
      </CardContent>
    </form>
  )
}
