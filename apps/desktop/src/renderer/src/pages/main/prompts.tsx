import React from 'react'
import {
  Button,
  CardContent,
  Textarea,
  TypographyH3,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import {
  promptsStore,
  defaultPromptTemplateText,
  promptTemplatePlaceholders
} from '@renderer/stores/prompts-store'
import { useStore } from 'zustand'

function resolveTemplateValue(template: string): string {
  return template.length > 0 ? template : defaultPromptTemplateText
}

function insertPlaceholderToken(
  currentText: string,
  token: string,
  textarea: HTMLTextAreaElement | null
): { nextText: string; nextCaret: number | null } {
  if (!textarea) {
    return { nextText: `${currentText}${token}`, nextCaret: null }
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  if (start == null || end == null) {
    return { nextText: `${currentText}${token}`, nextCaret: null }
  }

  return {
    nextText: `${currentText.slice(0, start)}${token}${currentText.slice(end)}`,
    nextCaret: start + token.length
  }
}

export const Prompts: React.FC = () => {
  const { data: savedPrompts, isHydrated, update } = useStore(promptsStore)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
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

  const availablePlaceholders = React.useMemo(
    () => promptTemplatePlaceholders.filter((placeholder) => placeholder.availability === 'available'),
    []
  )
  const plannedPlaceholders = React.useMemo(
    () => promptTemplatePlaceholders.filter((placeholder) => placeholder.availability === 'planned'),
    []
  )

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

    const previousPersistedTemplate = savedPrompts.template

    setIsSaving(true)
    setSaveError(null)

    try {
      await update({ template })
      setSaveError(null)
    } catch (error) {
      promptsStore.setState((state) => ({
        ...state,
        data: {
          ...state.data,
          template: previousPersistedTemplate
        }
      }))
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save prompt template. Please try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  function handleInsertToken(token: string) {
    let nextCaret: number | null = null

    setTemplate((currentTemplate) => {
      const insertion = insertPlaceholderToken(currentTemplate, token, textareaRef.current)
      nextCaret = insertion.nextCaret
      return insertion.nextText
    })

    if (nextCaret == null) {
      return
    }

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      textarea.focus()
      textarea.setSelectionRange(nextCaret, nextCaret)
    })
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
        <label htmlFor="prompt-template-editor" className="text-sm font-medium">
          Prompt template
        </label>
        <Textarea
          id="prompt-template-editor"
          ref={textareaRef}
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
          Saves are permissive. Unknown placeholders are allowed.
        </TypographyMuted>
      </CardContent>

      <section className="space-y-4">
        <div className="space-y-2">
          <TypographySmall>Available placeholders</TypographySmall>
          <div className="space-y-2">
            {availablePlaceholders.map((placeholder) => (
              <div key={placeholder.token} className="rounded-lg border border-border/60 p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleInsertToken(placeholder.token)}
                >
                  {placeholder.token}
                </Button>
                <TypographySmall className="mt-2">{placeholder.label}</TypographySmall>
                <TypographyMuted className="text-xs">{placeholder.description}</TypographyMuted>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <TypographySmall>Planned placeholders</TypographySmall>
          <div className="space-y-2">
            {plannedPlaceholders.map((placeholder) => (
              <div key={placeholder.token} className="rounded-lg border border-border/60 p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleInsertToken(placeholder.token)}
                >
                  {placeholder.token}
                </Button>
                <TypographySmall className="mt-2">{placeholder.label}</TypographySmall>
                <TypographyMuted className="text-xs">{placeholder.description}</TypographyMuted>
              </div>
            ))}
          </div>
        </div>
      </section>
    </form>
  )
}
