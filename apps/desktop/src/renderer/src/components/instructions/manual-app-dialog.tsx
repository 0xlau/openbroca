import React from 'react'
import { normalizeManualAppIdentity, type AppPlatform } from '@openbroca/app-identity'
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
  SelectValue
} from '@openbroca/ui'
import type { InstructionActivationApp } from '@renderer/stores/instructions-store'

interface ManualAppDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddApp: (app: InstructionActivationApp) => void
}

interface ManualAppDraft {
  displayName: string
  platform: AppPlatform
  stableId: string
  bundleId: string
  aumid: string
  path: string
}

const INITIAL_DRAFT: ManualAppDraft = {
  displayName: '',
  platform: 'macos',
  stableId: '',
  bundleId: '',
  aumid: '',
  path: ''
}

export function ManualAppDialog({ open, onOpenChange, onAddApp }: ManualAppDialogProps) {
  const [draft, setDraft] = React.useState<ManualAppDraft>(INITIAL_DRAFT)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      return
    }

    setDraft(INITIAL_DRAFT)
    setErrorMessage(null)
  }, [open])

  const canSubmit = Boolean(draft.stableId.trim())

  function setDraftValue<Key extends keyof ManualAppDraft>(key: Key, value: ManualAppDraft[Key]) {
    setDraft((current) => ({
      ...current,
      [key]: value
    }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    try {
      const app = normalizeManualAppIdentity({
        displayName: draft.displayName,
        platform: draft.platform,
        stableId: draft.stableId,
        bundleId: draft.bundleId,
        aumid: draft.aumid,
        path: draft.path
      })

      onAddApp(app)
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not add the app.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add manual app</DialogTitle>
            <DialogDescription>
              Use manual entry when the app is not listed in detected apps.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="manual-app-display-name">Display name</FieldLabel>
              <FieldContent>
                <Input
                  id="manual-app-display-name"
                  value={draft.displayName}
                  onChange={(event) => setDraftValue('displayName', event.target.value)}
                  placeholder="Terminal"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="manual-app-platform">Platform</FieldLabel>
              <FieldContent>
                <Select
                  value={draft.platform}
                  onValueChange={(value) => setDraftValue('platform', value as AppPlatform)}
                >
                  <SelectTrigger id="manual-app-platform">
                    <SelectValue placeholder="Select a platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="macos">macOS</SelectItem>
                      <SelectItem value="windows">Windows</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="manual-app-stable-id">Stable ID</FieldLabel>
              <FieldContent>
                <Input
                  id="manual-app-stable-id"
                  value={draft.stableId}
                  onChange={(event) => setDraftValue('stableId', event.target.value)}
                  placeholder="manual.terminal"
                />
                <FieldDescription>
                  Use the same stable ID every time so this rule stays matched.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="manual-app-bundle-id">Bundle ID</FieldLabel>
              <FieldContent>
                <Input
                  id="manual-app-bundle-id"
                  value={draft.bundleId}
                  onChange={(event) => setDraftValue('bundleId', event.target.value)}
                  placeholder="com.apple.Terminal"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="manual-app-aumid">AUMID</FieldLabel>
              <FieldContent>
                <Input
                  id="manual-app-aumid"
                  value={draft.aumid}
                  onChange={(event) => setDraftValue('aumid', event.target.value)}
                  placeholder="Microsoft.WindowsTerminal_8wekyb3d8bbwe!App"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="manual-app-path">Path</FieldLabel>
              <FieldContent>
                <Input
                  id="manual-app-path"
                  value={draft.path}
                  onChange={(event) => setDraftValue('path', event.target.value)}
                  placeholder="/Applications/Terminal.app"
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              Save app
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
