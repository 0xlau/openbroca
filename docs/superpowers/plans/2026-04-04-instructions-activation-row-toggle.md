# Instructions Activation Row Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Instructions activation-app picker so row clicks toggle selection, occupied apps can be reassigned through confirmation, and selected state/removal use icon-only affordances.

**Architecture:** Keep the existing compact popover picker and `@openbroca/ui` composition, but move selection from the inline `Add` button to the `CommandItem` row itself. Add a small transfer-confirmation state machine in the picker for occupied apps, keep the popover open through normal select/unselect and successful transfers, and switch both row and chip affordances to icon-based feedback using Hugeicons.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library, `@openbroca/ui`, `@hugeicons/react`, `@hugeicons/core-free-icons`

---

## File Structure

### Existing Files To Modify

- `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
  Owns the activation-app popover interaction and will absorb row-toggle selection, transfer confirmation, and icon-only state affordances.
- `apps/desktop/src/renderer/src/pages/main/instructions.tsx`
  Owns the rule-save flow and will need a narrow API update if picker transfers require returning a fully-updated app list or a transfer callback.
- `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
  Protects the picker interaction and should add row-toggle, transfer-confirmation, and close/check icon assertions.

### New Files To Create

- None

---

### Task 0: Continue In The Existing Worktree

**Files:**
- None

- [ ] **Step 1: Switch into the existing feature worktree and verify the branch**

Run:

```bash
cd /Users/liupeiqiang/Studio/OpenSource/openbroca-instructions
git branch --show-current
```

Expected: `feat/instructions-app-identity`

- [ ] **Step 2: Verify the worktree is clean before starting**

Run:

```bash
git status --short
```

Expected: no uncommitted tracked changes.

---

### Task 1: Add Row Toggle And Transfer Confirmation To The Activation App Picker

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/instructions.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`

- [ ] **Step 1: Write the failing row-toggle test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('toggles an app by clicking the list row and keeps the popover open', async () => {
  detectedApps = [
    {
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      iconDataUrl: 'data:image/png;base64,cursor',
      source: 'detected'
    }
  ]

  const { Instructions } = await import('../instructions')

  render(<Instructions />)

  fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))

  fireEvent.click(screen.getByText('Cursor'))
  expect(screen.getByTestId('activation-app-popover')).toBeTruthy()
  expect(screen.getByLabelText('Remove Cursor')).toBeTruthy()

  fireEvent.click(screen.getByText('Cursor'))
  expect(screen.queryByLabelText('Remove Cursor')).toBeNull()
  expect(screen.getByTestId('activation-app-popover')).toBeTruthy()
})
```

- [ ] **Step 2: Write the failing occupied-app transfer test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('confirms transfer when selecting an app owned by another instruction', async () => {
  detectedApps = [
    {
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      iconDataUrl: 'data:image/png;base64,cursor',
      source: 'detected'
    }
  ]

  instructionsStoreMock = createInstructionsStore({
    rules: [
      {
        id: 'rule-a',
        name: 'Coding',
        activationApps: [detectedApps[0]],
        customInstructions: '',
        autoEnterMode: 'off'
      }
    ]
  })

  const { Instructions } = await import('../instructions')

  render(<Instructions />)

  fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Writing' } })
  fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
  fireEvent.click(screen.getByText('Cursor'))

  expect(screen.getByRole('alertdialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Move app' }))

  expect(screen.getByTestId('activation-app-popover')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Create instruction' }))

  await waitFor(() => {
    expect(instructionsStoreMock.getState().replace).toHaveBeenCalled()
  })

  const nextSettings = vi.mocked(instructionsStoreMock.getState().replace).mock.calls.at(-1)?.[0]
  expect(nextSettings.rules).toEqual([
    expect.objectContaining({
      id: 'rule-a',
      activationApps: []
    }),
    expect.objectContaining({
      name: 'Writing',
      activationApps: [expect.objectContaining({ id: 'com.todesktop.230313mzl4w4u92' })]
    })
  ])
})
```

- [ ] **Step 3: Write the failing icon-affordance test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('shows a check icon for selected rows and a close icon for selected chips', async () => {
  detectedApps = [
    {
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor',
      platform: 'macos',
      bundleId: 'com.todesktop.230313mzl4w4u92',
      iconDataUrl: 'data:image/png;base64,cursor',
      source: 'detected'
    }
  ]

  const { Instructions } = await import('../instructions')

  render(<Instructions />)

  fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
  fireEvent.click(screen.getByText('Cursor'))

  expect(screen.getByTestId('activation-app-selected-icon-com.todesktop.230313mzl4w4u92')).toBeTruthy()
  expect(screen.getByLabelText('Remove Cursor')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add Cursor' })).toBeNull()
})
```

- [ ] **Step 4: Run the focused page test and verify it fails**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
```

Expected: FAIL because the picker still uses button-based add flow and has no transfer confirmation state.

- [ ] **Step 5: Implement row-toggle selection and occupied-app transfer**

Update `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`.

Import the required dialog and icons:

```tsx
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@openbroca/ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
```

Add transfer state:

```tsx
const [pendingTransferApp, setPendingTransferApp] = React.useState<InstructionActivationApp | null>(null)
```

Update the picker props so the parent can reconcile transfers across rules:

```tsx
interface ActivationAppPickerProps {
  value: InstructionActivationApp[]
  detectedApps: AppIdentity[]
  ownedAppNamesById: Record<string, string>
  onChange: (apps: InstructionActivationApp[]) => void
  onTransferApp?: (app: InstructionActivationApp) => void
}
```

Replace `addApp` with a row-toggle helper:

```tsx
function toggleApp(app: InstructionActivationApp) {
  if (selectedIds.has(app.id)) {
    onChange(value.filter((candidate) => candidate.id !== app.id))
    return
  }

  const ownerName = ownedAppNamesById[app.id]
  if (ownerName) {
    setPendingTransferApp(app)
    return
  }

  onChange([...value, app])
}
```

Use the row itself as the interaction:

```tsx
<CommandItem
  key={app.id}
  value={toSearchText(app)}
  onSelect={() => toggleApp(app)}
  className="items-start gap-3 py-2.5"
>
  <ActivationAppIcon ... />
  <div className="min-w-0 flex-1">...</div>
  {isSelected ? (
    <HugeiconsIcon
      icon={Tick02Icon}
      strokeWidth={2}
      className="size-4 shrink-0"
      data-testid={`activation-app-selected-icon-${app.id}`}
    />
  ) : null}
</CommandItem>
```

For occupied apps, show owner text and no check icon:

```tsx
<p className="truncate text-xs text-muted-foreground">
  {ownerName ? `Used by ${ownerName}` : getSecondaryIdentity(app)}
</p>
```

Add transfer confirmation and keep the popover open:

```tsx
<AlertDialog open={Boolean(pendingTransferApp)} onOpenChange={(open) => !open && setPendingTransferApp(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Move app to this instruction?</AlertDialogTitle>
      <AlertDialogDescription>
        This will remove {pendingTransferApp?.displayName} from {pendingTransferApp ? ownedAppNamesById[pendingTransferApp.id] : ''} and add it to the instruction you are editing.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          if (pendingTransferApp) {
            onTransferApp?.(pendingTransferApp)
            setPendingTransferApp(null)
            setIsPickerOpen(true)
          }
        }}
      >
        Move app
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Replace the chip remove text button with a close icon button:

```tsx
<Button
  type="button"
  size="xs"
  variant="ghost"
  aria-label={`Remove ${app.displayName}`}
  onClick={() => removeApp(app.id)}
>
  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
</Button>
```

- [ ] **Step 6: Reconcile transfers in the page save flow**

Update `apps/desktop/src/renderer/src/pages/main/instructions.tsx` so the editor can stage a transfer without immediately persisting:

```tsx
const [draftRules, setDraftRules] = React.useState<InstructionRule[] | null>(null)
```

Initialize the draft when opening the editor:

```tsx
setEditorState({ open: true, rule })
setDraftRules(data.rules)
```

Pass the transfer callback into the picker/editor flow:

```tsx
onTransferApp={(app) =>
  setDraftRules((current) =>
    (current ?? data.rules).map((candidate) => ({
      ...candidate,
      activationApps:
        candidate.id === editorState.rule?.id
          ? [...candidate.activationApps.filter((item) => item.id !== app.id), app]
          : candidate.activationApps.filter((item) => item.id !== app.id)
    }))
  )
}
```

When saving, persist from `draftRules` instead of the stale rule list:

```tsx
const baseRules = draftRules ?? data.rules
const remaining = baseRules.filter((candidate) => candidate.id !== nextRule.id)
await replace({ rules: [...remaining, nextRule] })
```

Reset `draftRules` when the dialog closes successfully or is cancelled.

- [ ] **Step 7: Update the test mocks for AlertDialog and icon assertions**

In `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`, add minimal mocks for:

```tsx
AlertDialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
  open ? <div role="alertdialog">{children}</div> : null,
AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
AlertDialogCancel: ({ children, onClick }: React.ComponentProps<'button'>) => <button type="button" onClick={onClick}>{children}</button>,
AlertDialogAction: ({ children, onClick }: React.ComponentProps<'button'>) => <button type="button" onClick={onClick}>{children}</button>,
```

Mock Hugeicons in a way that preserves a queryable marker:

```tsx
HugeiconsIcon: ({ ...props }: Record<string, unknown>) => <span data-testid={String(props['data-testid'] ?? 'hugeicon')} />
```

- [ ] **Step 8: Run the focused test and typecheck**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
pnpm --filter desktop typecheck:web
```

Expected: PASS.

- [ ] **Step 9: Commit the row-toggle interaction**

Run:

```bash
git add apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx \
  apps/desktop/src/renderer/src/pages/main/instructions.tsx \
  apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx
git commit -m "feat(instructions): toggle activation app rows"
```

---

## Self-Review

- Spec coverage:
  - row click toggles select/unselect and keeps popover open: Task 1
  - occupied rows use `AlertDialog` transfer flow: Task 1
  - selected rows use a trailing Hugeicons check icon: Task 1
  - selected chips use a close icon removal button: Task 1
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” markers remain
  - each step has explicit files, commands, and code snippets
- Type consistency:
  - `ActivationAppPicker` transfer callback is introduced and then consumed by `instructions.tsx`
  - the same row-click interaction path is covered by the focused page test

