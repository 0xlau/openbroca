import React from 'react'
import {
  Button,
  CardContent,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  TypographyH3,
  TypographyMuted
} from '@openbroca/ui'
import { shortcutsStore, defaultShortcutSettings } from '@renderer/stores/shortcuts-store'
import { useStore } from 'zustand'
import {
  validateShortcutSettings,
  type ShortcutSettings,
  type ShortcutValidationIssue
} from '../../../../shared/shortcuts'

const MODIFIER_ONLY_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift'])
const SINGLE_MODIFIER_ACCELERATORS = new Set(['Command', 'Control', 'Option', 'Shift'])
const SUPPORTED_NAMED_KEYS = new Set([
  'Space',
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'Up',
  'Down',
  'Left',
  'Right',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12'
])
const SPECIAL_KEY_NORMALIZATION_MAP: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  Spacebar: 'Space',
  Escape: 'Escape',
  Esc: 'Escape',
  Enter: 'Enter',
  Return: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete'
}
let failedDraftSnapshot: ShortcutSettings | null = null
const MODIFIER_TOKEN_BY_KEY: Record<string, string> = {
  Control: 'Control',
  Meta: 'Command',
  Alt: 'Option',
  Shift: 'Shift'
}

function isSameSettings(left: ShortcutSettings, right: ShortcutSettings): boolean {
  return (
    left.quickAccelerator === right.quickAccelerator &&
    left.toHoldKey === right.toHoldKey &&
    left.holdAccelerator === right.holdAccelerator
  )
}

function normalizeKeyToken(
  event: React.KeyboardEvent<HTMLInputElement>
): { keyToken: string | null; unsupportedKey: string | null } {
  if (MODIFIER_ONLY_KEYS.has(event.key)) {
    return { keyToken: null, unsupportedKey: null }
  }

  if (event.code === 'Space') {
    return { keyToken: 'Space', unsupportedKey: null }
  }

  if (/^Numpad/.test(event.code)) {
    return { keyToken: null, unsupportedKey: event.code }
  }

  const digitCodeMatch = /^Digit([0-9])$/.exec(event.code)
  if (digitCodeMatch) {
    return { keyToken: digitCodeMatch[1], unsupportedKey: null }
  }

  const mappedKey = SPECIAL_KEY_NORMALIZATION_MAP[event.key]
  if (mappedKey) {
    return { keyToken: mappedKey, unsupportedKey: null }
  }

  if (/^[A-Za-z0-9]$/.test(event.key)) {
    return { keyToken: event.key.toUpperCase(), unsupportedKey: null }
  }

  const key = event.key.toUpperCase()
  if (SUPPORTED_NAMED_KEYS.has(key)) {
    return { keyToken: key, unsupportedKey: null }
  }

  return { keyToken: null, unsupportedKey: event.key }
}

function captureAccelerator(
  event: React.KeyboardEvent<HTMLInputElement>
): { accelerator: string | null; unsupportedKey: string | null } {
  const modifierOnlyToken = MODIFIER_TOKEN_BY_KEY[event.key]
  if (modifierOnlyToken) {
    return { accelerator: modifierOnlyToken, unsupportedKey: null }
  }

  const { keyToken, unsupportedKey } = normalizeKeyToken(event)
  if (!keyToken) {
    return { accelerator: null, unsupportedKey }
  }

  const modifiers: string[] = []
  if (event.ctrlKey) {
    modifiers.push('Control')
  }
  if (event.metaKey) {
    modifiers.push('Command')
  }
  if (event.altKey) {
    modifiers.push('Option')
  }
  if (event.shiftKey) {
    modifiers.push('Shift')
  }

  return { accelerator: [...modifiers, keyToken].join('+'), unsupportedKey: null }
}

function getUnsupportedKeyMessage(key: string): string {
  return `Unsupported key "${key}".`
}

function getValidationMessage(
  issues: ShortcutValidationIssue[],
  field: keyof ShortcutSettings
): string | null {
  const issue = issues.find((item) => item.field === field)
  return issue?.message ?? null
}

function isSingleModifierAccelerator(accelerator: string): boolean {
  return SINGLE_MODIFIER_ACCELERATORS.has(accelerator)
}

function getShortcutDescription(
  accelerator: string,
  mode: 'quick' | 'hold'
): string {
  if (isSingleModifierAccelerator(accelerator)) {
    return `Double Tap ${accelerator} to trigger ${mode === 'quick' ? 'Quick' : 'Hold'}.`
  }

  return mode === 'quick'
    ? 'Press a key combination, like Option+Space. Single modifiers (Command / Control / Option / Shift) trigger on double tap.'
    : 'Press a key combination, like Option+Shift+Space. Single modifiers (Command / Control / Option / Shift) trigger on double tap.'
}

export const Shortcuts: React.FC = () => {
  const { data: savedSettings, isHydrated, update, replace } = useStore(shortcutsStore)
  const [draft, setDraft] = React.useState<ShortcutSettings>(() => {
    if (failedDraftSnapshot && !isSameSettings(failedDraftSnapshot, savedSettings)) {
      return failedDraftSnapshot
    }

    failedDraftSnapshot = null
    return savedSettings
  })
  const [isSaving, setIsSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [captureErrors, setCaptureErrors] = React.useState<
    Partial<Record<keyof ShortcutSettings, string | null>>
  >({})
  const [hasFailedSave, setHasFailedSave] = React.useState(false)
  const lastSyncedDraftRef = React.useRef<ShortcutSettings>(savedSettings)

  React.useEffect(() => {
    if (!isHydrated) {
      return
    }

    if (!isSameSettings(draft, lastSyncedDraftRef.current)) {
      return
    }

    setDraft(savedSettings)
  }, [draft, isHydrated, savedSettings])

  const isDirty = isHydrated && (!isSameSettings(draft, savedSettings) || hasFailedSave)
  const validationIssues = React.useMemo(() => validateShortcutSettings(draft), [draft])
  const holdError = getValidationMessage(validationIssues, 'holdAccelerator')
  const toHoldError = getValidationMessage(validationIssues, 'toHoldKey')

  React.useEffect(() => {
    if (!isHydrated || isSaving || isDirty) {
      return
    }

    lastSyncedDraftRef.current = savedSettings
  }, [isDirty, isHydrated, isSaving, savedSettings])

  async function saveChanges() {
    if (!isDirty || isSaving || validationIssues.length > 0) {
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await update(draft)
      setSaveError(null)
      setHasFailedSave(false)
      failedDraftSnapshot = null
    } catch (error) {
      const baseError = error instanceof Error ? error.message : 'Failed to save shortcuts.'
      setHasFailedSave(true)
      failedDraftSnapshot = draft
      try {
        await replace({ ...lastSyncedDraftRef.current })
        setSaveError(baseError)
      } catch (rollbackError) {
        const rollbackMessage =
          rollbackError instanceof Error ? rollbackError.message : 'Failed to restore shortcuts.'
        setSaveError(`${baseError} ${rollbackMessage}`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  function updateDraft(next: Partial<ShortcutSettings>, field?: keyof ShortcutSettings) {
    setDraft((current) => {
      const nextDraft = { ...current, ...next }
      if (failedDraftSnapshot || hasFailedSave) {
        failedDraftSnapshot = nextDraft
      }
      return nextDraft
    })
    if (field) {
      setCaptureErrors((current) => {
        if (!current[field]) {
          return current
        }
        return { ...current, [field]: null }
      })
    }
    if (saveError) {
      setSaveError(null)
    }
    if (hasFailedSave) {
      setHasFailedSave(false)
    }
  }

  function setCaptureError(field: keyof ShortcutSettings, error: string | null) {
    setCaptureErrors((current) => ({ ...current, [field]: error ?? null }))
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
          <TypographyH3 className="text-left">Shortcuts</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Customize how the floating window opens and how hold-to-talk is triggered.
          </TypographyMuted>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft({ ...defaultShortcutSettings })
              setCaptureErrors({})
              failedDraftSnapshot = null
              if (saveError) {
                setSaveError(null)
              }
              if (hasFailedSave) {
                setHasFailedSave(false)
              }
            }}
          >
            Reset to defaults
          </Button>
          {isDirty ? (
            <Button type="submit" disabled={isSaving || validationIssues.length > 0}>
              Save changes
            </Button>
          ) : null}
        </div>
      </div>

      <CardContent className="px-0">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="shortcut-quick-accelerator">Quick shortcut</FieldLabel>
            <FieldContent>
              <Input
                id="shortcut-quick-accelerator"
                value={draft.quickAccelerator}
                readOnly
                onKeyDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()

                  const { accelerator, unsupportedKey } = captureAccelerator(event)
                  if (!accelerator) {
                    if (unsupportedKey) {
                      setCaptureError('quickAccelerator', getUnsupportedKeyMessage(unsupportedKey))
                    }
                    return
                  }

                  updateDraft({ quickAccelerator: accelerator }, 'quickAccelerator')
                }}
              />
              <FieldDescription>
                {getShortcutDescription(draft.quickAccelerator, 'quick')}
              </FieldDescription>
              {captureErrors.quickAccelerator ? (
                <p role="alert" className="text-sm text-destructive">
                  {captureErrors.quickAccelerator}
                </p>
              ) : null}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="shortcut-to-hold-key">To Hold key</FieldLabel>
            <FieldContent>
              <Input
                id="shortcut-to-hold-key"
                value={draft.toHoldKey}
                readOnly
                onKeyDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()

                  const { keyToken, unsupportedKey } = normalizeKeyToken(event)
                  if (!keyToken) {
                    if (unsupportedKey) {
                      setCaptureError('toHoldKey', getUnsupportedKeyMessage(unsupportedKey))
                    }
                    return
                  }

                  updateDraft({ toHoldKey: keyToken }, 'toHoldKey')
                }}
              />
              <FieldDescription>Press a single key used to enter hold mode.</FieldDescription>
              {captureErrors.toHoldKey ? (
                <p role="alert" className="text-sm text-destructive">
                  {captureErrors.toHoldKey}
                </p>
              ) : null}
              {toHoldError ? (
                <p role="alert" className="text-sm text-destructive">
                  {toHoldError}
                </p>
              ) : null}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="shortcut-hold-accelerator">Hold shortcut</FieldLabel>
            <FieldContent>
              <Input
                id="shortcut-hold-accelerator"
                value={draft.holdAccelerator}
                readOnly
                onKeyDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()

                  const { accelerator, unsupportedKey } = captureAccelerator(event)
                  if (!accelerator) {
                    if (unsupportedKey) {
                      setCaptureError('holdAccelerator', getUnsupportedKeyMessage(unsupportedKey))
                    }
                    return
                  }

                  updateDraft({ holdAccelerator: accelerator }, 'holdAccelerator')
                }}
              />
              <FieldDescription>
                {getShortcutDescription(draft.holdAccelerator, 'hold')}
              </FieldDescription>
              {captureErrors.holdAccelerator ? (
                <p role="alert" className="text-sm text-destructive">
                  {captureErrors.holdAccelerator}
                </p>
              ) : null}
              {holdError ? (
                <p role="alert" className="text-sm text-destructive">
                  {holdError}
                </p>
              ) : null}
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>

      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}
    </form>
  )
}
