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
  Switch,
  Textarea
} from '@openbroca/ui'
import type { InstructionActivationApp, InstructionRule } from '@renderer/stores/instructions-store'
import { ActivationAppPicker } from './activation-app-picker'

export interface InstructionEditorValue {
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnter: boolean
}

interface InstructionEditorDialogProps {
  mode: 'create' | 'edit'
  open: boolean
  rule: InstructionRule | null
  detectedApps: AppIdentity[]
  ownedAppNamesById: Record<string, string>
  onOpenChange: (open: boolean) => void
  onSubmit: (value: InstructionEditorValue) => void
}

function toDraft(rule: InstructionRule | null): InstructionEditorValue {
  return {
    name: rule?.name ?? '',
    activationApps: rule?.activationApps ?? [],
    customInstructions: rule?.customInstructions ?? '',
    autoEnter: rule?.autoEnter ?? false
  }
}

export function InstructionEditorDialog({
  mode,
  open,
  rule,
  detectedApps,
  ownedAppNamesById,
  onOpenChange,
  onSubmit
}: InstructionEditorDialogProps) {
  const [draft, setDraft] = React.useState<InstructionEditorValue>(() => toDraft(rule))

  React.useEffect(() => {
    if (!open) {
      return
    }
    setDraft(toDraft(rule))
  }, [open, rule])

  const canSubmit = Boolean(draft.name.trim()) && draft.activationApps.length > 0

  const dialogTitle = mode === 'create' ? 'Create instruction' : 'Edit instruction'
  const submitLabel = mode === 'create' ? 'Create instruction' : 'Save changes'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) {
              return
            }

            onSubmit({
              ...draft,
              name: draft.name.trim(),
              customInstructions: draft.customInstructions.trim()
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              Choose activation apps and instructions for when this rule should apply.
            </DialogDescription>
          </DialogHeader>

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
              <FieldLabel>Activation apps</FieldLabel>
              <FieldContent>
                <ActivationAppPicker
                  value={draft.activationApps}
                  detectedApps={detectedApps}
                  ownedAppNamesById={ownedAppNamesById}
                  onChange={(activationApps) =>
                    setDraft((current) => ({
                      ...current,
                      activationApps
                    }))
                  }
                />
                <FieldDescription>
                  Add one or more apps that should activate this instruction rule.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="instruction-rule-custom-instructions">Custom instructions</FieldLabel>
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
                  checked={draft.autoEnter}
                  onCheckedChange={(autoEnter) =>
                    setDraft((current) => ({
                      ...current,
                      autoEnter
                    }))
                  }
                />
                <FieldDescription>Simulates pressing a send key after processing.</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
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
