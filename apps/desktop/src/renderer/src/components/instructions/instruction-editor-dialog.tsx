import React from 'react'
import type { AppIdentity } from '@openbroca/app-identity'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea
} from '@openbroca/ui'
import type { InstructionActivationApp, InstructionRule } from '@renderer/stores/instructions-store'
import type { AutoEnterMode } from '../../../../shared/instructions'
import { ActivationAppPicker } from './activation-app-picker'

export interface InstructionEditorValue {
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnterMode: AutoEnterMode
}

interface InstructionEditorDialogProps {
  mode: 'create' | 'edit'
  open: boolean
  rule: InstructionRule | null
  detectedApps: AppIdentity[]
  ownedAppNamesById: Record<string, string>
  onTransferApp?: (app: InstructionActivationApp) => void
  isSubmitting: boolean
  errorMessage: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (value: InstructionEditorValue) => Promise<void>
}

type ActionableAutoEnterMode = Exclude<AutoEnterMode, 'off'>

function toDraft(rule: InstructionRule | null): InstructionEditorValue {
  return {
    name: rule?.name ?? '',
    activationApps: rule?.activationApps ?? [],
    customInstructions: rule?.customInstructions ?? '',
    autoEnterMode: rule?.autoEnterMode ?? 'off'
  }
}

function toActionableAutoEnterMode(mode: AutoEnterMode | undefined): ActionableAutoEnterMode {
  return mode === 'mod-enter' ? 'mod-enter' : 'enter'
}

export function InstructionEditorDialog({
  mode,
  open,
  rule,
  detectedApps,
  ownedAppNamesById,
  onTransferApp,
  isSubmitting,
  errorMessage,
  onOpenChange,
  onSubmit
}: InstructionEditorDialogProps) {
  const [draft, setDraft] = React.useState<InstructionEditorValue>(() => toDraft(rule))
  const [lastActionableAutoEnterMode, setLastActionableAutoEnterMode] =
    React.useState<ActionableAutoEnterMode>(() => toActionableAutoEnterMode(rule?.autoEnterMode))

  React.useEffect(() => {
    if (!open) {
      return
    }
    setDraft(toDraft(rule))
    setLastActionableAutoEnterMode(toActionableAutoEnterMode(rule?.autoEnterMode))
  }, [open, rule])

  const canSubmit = Boolean(draft.name.trim()) && draft.activationApps.length > 0 && !isSubmitting
  const autoEnterEnabled = draft.autoEnterMode !== 'off'
  const selectedSendKeyMode = autoEnterEnabled ? draft.autoEnterMode : lastActionableAutoEnterMode

  const dialogTitle = mode === 'create' ? 'Create instruction' : 'Edit instruction'
  const submitLabel = mode === 'create' ? 'Create instruction' : 'Save changes'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] sm:max-w-lg flex-col p-0">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!canSubmit) {
              return
            }

            await onSubmit({
              ...draft,
              name: draft.name.trim(),
              customInstructions: draft.customInstructions.trim()
            })
          }}
        >
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              Choose activation apps and instructions for when this rule should apply.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="instruction-rule-name">Name</FieldLabel>
                <FieldContent>
                  <Input
                    id="instruction-rule-name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                    placeholder="Coding focus"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldContent>
                  <ActivationAppPicker
                    value={draft.activationApps}
                    detectedApps={detectedApps}
                    ownedAppNamesById={ownedAppNamesById}
                    onTransferApp={onTransferApp}
                    onChange={(activationApps) =>
                      setDraft((current) => ({
                        ...current,
                        activationApps
                      }))
                    }
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="instruction-rule-custom-instructions">
                  Custom instructions
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    id="instruction-rule-custom-instructions"
                    value={draft.customInstructions}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        customInstructions: event.target.value
                      }))
                    }
                    placeholder="Prefer concise technical language."
                  />
                </FieldContent>
              </Field>

              <Field orientation="horizontal">
                <FieldLabel htmlFor="instruction-rule-auto-enter">Auto enter</FieldLabel>
                <FieldContent>
                  <Switch
                    id="instruction-rule-auto-enter"
                    checked={autoEnterEnabled}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        setDraft((current) => {
                          if (current.autoEnterMode !== 'off') {
                            setLastActionableAutoEnterMode(current.autoEnterMode)
                          }

                          return {
                            ...current,
                            autoEnterMode: 'off'
                          }
                        })
                        return
                      }

                      setDraft((current) => ({
                        ...current,
                        autoEnterMode:
                          current.autoEnterMode === 'off'
                            ? lastActionableAutoEnterMode
                            : current.autoEnterMode
                      }))
                    }}
                  />
                  <FieldDescription>
                    Simulates pressing a send key after processing.
                  </FieldDescription>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="instruction-rule-send-key">Send key</FieldLabel>
                <FieldContent>
                  <Select
                    value={selectedSendKeyMode}
                    onValueChange={(nextValue) => {
                      const nextMode = nextValue as ActionableAutoEnterMode
                      setLastActionableAutoEnterMode(nextMode)
                      setDraft((current) => ({
                        ...current,
                        autoEnterMode: current.autoEnterMode === 'off' ? 'off' : nextMode
                      }))
                    }}
                  >
                    <SelectTrigger id="instruction-rule-send-key" disabled={!autoEnterEnabled}>
                      <SelectValue placeholder="Select a send key" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="enter">Enter</SelectItem>
                        <SelectItem value="mod-enter">Cmd/Ctrl + Enter</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>Used when auto enter is enabled.</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            {errorMessage ? <p className="mt-4 text-sm text-destructive">{errorMessage}</p> : null}
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
