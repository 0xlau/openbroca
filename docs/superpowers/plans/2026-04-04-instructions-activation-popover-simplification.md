# Instructions Activation Popover Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Instructions activation-app UI by removing manual app entry, moving the small `Select apps` trigger into the field header row, and constraining the activation-app popover to a compact scrollable panel.

**Architecture:** Keep the existing `Instructions` page, card layout, and app-icon rendering, but narrow the activation-app interaction surface. The picker remains a `Popover + Command` composition from `@openbroca/ui`, while the manual-app branch and its supporting copy/tests are removed. The work stays entirely in the renderer UI and its tests.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library, `@openbroca/ui`

---

## File Structure

### Existing Files To Modify

- `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
  Owns the app selection interaction and will drop manual-entry support, move the trigger into the label row, and constrain popover size.
- `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`
  Owns the form layout and will host the `Activation apps` label row with the small trigger button.
- `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`
  Remove usage from the picker. Delete the file if nothing else references it.
- `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
  Update tests to remove manual-app coverage and assert the new compact popover interaction.

### Files To Delete If Unused

- `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`
  Delete if the picker no longer references it after the simplification.

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

### Task 1: Simplify The Activation App Picker UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
- Modify: `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
- Delete: `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx` (if unused)

- [ ] **Step 1: Write the failing compact-popover test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('shows a small Select apps button in the activation-app field header and hides manual app actions', async () => {
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

  expect(screen.getByRole('button', { name: 'Select apps' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add manual app' })).toBeNull()
})
```

- [ ] **Step 2: Write the failing popover size/placement test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('renders activation app options inside a compact popover', async () => {
  const { Instructions } = await import('../instructions')

  render(<Instructions />)

  fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))

  const popover = screen.getByTestId('activation-app-popover')
  expect(popover.className).toContain('w-80')
  expect(popover.className).toContain('max-h-[min(50vh,360px)]')
})
```

- [ ] **Step 3: Run the page test and verify it fails**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
```

Expected: FAIL because manual app actions still exist and the compact popover markup is not present.

- [ ] **Step 4: Remove manual app flow and tighten popover layout**

Update `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`:

```tsx
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@openbroca/ui'
```

Remove:

```tsx
import { ManualAppDialog } from './manual-app-dialog'
const [isManualDialogOpen, setIsManualDialogOpen] = React.useState(false)
function addManualApp(...) { ... }
```

Change the picker API so the trigger is supplied by the parent header row:

```tsx
interface ActivationAppPickerProps {
  value: InstructionActivationApp[]
  detectedApps: AppIdentity[]
  ownedAppNamesById: Record<string, string>
  trigger: React.ReactNode
  onChange: (apps: InstructionActivationApp[]) => void
}
```

Wrap the trigger:

```tsx
<Popover open={isPickerOpen} onOpenChange={handlePickerOpenChange}>
  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
  <PopoverContent
    align="start"
    className="w-80 max-h-[min(50vh,360px)] p-2"
    data-testid="activation-app-popover"
  >
    <Command className="rounded-xl border border-border/60 bg-transparent p-2">
      <CommandInput ... />
      <CommandList className="max-h-[280px] overflow-y-auto">
        ...
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

Remove the footer row and manual-app button:

```tsx
<div className="flex flex-wrap gap-2">...</div>
{errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
```

Delete `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx` if it is no longer imported anywhere.

- [ ] **Step 5: Move the small trigger button into the field header row**

Update `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`:

```tsx
<Field>
  <div className="flex items-center justify-between gap-3">
    <FieldLabel>Activation apps</FieldLabel>
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
      trigger={
        <Button type="button" size="sm" variant="outline">
          Select apps
        </Button>
      }
    />
  </div>
  <FieldContent>
    <FieldDescription>
      Add one or more apps that should activate this instruction rule.
    </FieldDescription>
  </FieldContent>
</Field>
```

Keep the selected chips rendered inside the picker body component, below the trigger row.

- [ ] **Step 6: Remove manual-app assertions and lock the new interaction in tests**

Update `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

- remove the old manual-app flow assertions
- keep icon assertions
- keep popover hidden-until-open assertions
- update the `@openbroca/ui` mock so `PopoverContent` can carry `data-testid` and className:

```ts
PopoverContent: ({ children, className, ...props }: React.ComponentProps<'div'>) => {
  const context = React.useContext(PopoverContext)
  return context?.open ? <div className={className} {...props}>{children}</div> : null
},
```

- [ ] **Step 7: Run the page test and verify it passes**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
pnpm --filter desktop typecheck:web
```

Expected: PASS.

- [ ] **Step 8: Commit the picker simplification**

Run:

```bash
git add apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx \
  apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx \
  apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx
git add -u apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx
git commit -m "refactor(instructions): simplify activation app picker"
```

---

## Self-Review

- Spec coverage:
  - remove `Add manual app` and related interaction: Task 1
  - move `Select apps` to the field label row as a small button: Task 1
  - constrain popover width/height with internal scrolling: Task 1
  - preserve icon display for activation-app UI: Task 1
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” markers remain
  - each task has explicit files, commands, and code snippets
- Type consistency:
  - `ActivationAppPicker` now accepts a `trigger` prop
  - `manual-app-dialog.tsx` is removed if unused, rather than left orphaned

