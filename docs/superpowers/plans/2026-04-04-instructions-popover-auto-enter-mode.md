# Instructions Popover And Auto-Enter Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the desktop Instructions feature so activation app selection uses a popover, all activation app UI shows icons, and auto-enter is stored and executed as an explicit send-key mode (`off`, `enter`, `mod-enter`).

**Architecture:** Keep the existing feature structure and existing worktree, but evolve the instruction schema from a boolean `autoEnter` flag to a single `autoEnterMode` enum with migration compatibility. On the renderer side, move activation app discovery into a popover-based picker and carry icon rendering through list rows, selected chips, and cards. On the main side, extend the auto-enter service to support both `enter` and `mod-enter` without broadening the runtime boundary.

**Tech Stack:** Electron, React, Zustand, TRPC, TypeScript, Vitest, Testing Library, `@openbroca/ui`

---

## File Structure

### Existing Files To Modify

- `apps/desktop/src/shared/instructions.ts`
  Owns the desktop-only persisted instruction schema and must migrate `autoEnter` to `autoEnterMode`.
- `apps/desktop/src/renderer/src/stores/instructions-store.ts`
  Wraps the persisted store and should continue normalizing write paths after the schema change.
- `apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts`
  Protects migration and normalization behavior for persisted instructions.
- `apps/desktop/src/main/send-key/auto-enter.ts`
  Owns the OS-specific send-key side effect and will gain support for both `enter` and `mod-enter`.
- `apps/desktop/src/main/__tests__/auto-enter.test.ts`
  Protects the macOS/Windows command construction for the send-key modes.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Consumes the matched instruction and should use `autoEnterMode` instead of a boolean.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Protects positive and negative runtime behavior around the auto-enter modes.
- `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
  Owns app selection UI and must switch from always-open command list to popover-triggered interaction.
- `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`
  Owns manual app entry and should keep working with the new picker while showing icon-friendly selected output.
- `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`
  Owns the create/edit form and must surface a `Switch` plus send-key `Select`.
- `apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx`
  Renders saved rule summaries and should show activation app icons plus the new auto-enter mode state.
- `apps/desktop/src/renderer/src/pages/main/instructions.tsx`
  Wires CRUD behavior and should pass the new enum field through save/edit flows.
- `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
  Protects popover interaction, icon rendering, disabled app selection, and auto-enter mode editing.

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

- [ ] **Step 2: Verify the worktree is clean before starting the follow-up**

Run:

```bash
git status --short
```

Expected: no uncommitted tracked changes.

---

### Task 1: Migrate Instruction Rules To `autoEnterMode`

**Files:**
- Modify: `apps/desktop/src/shared/instructions.ts`
- Modify: `apps/desktop/src/renderer/src/stores/instructions-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts`
- Modify: `apps/desktop/src/main/send-key/auto-enter.ts`
- Modify: `apps/desktop/src/main/__tests__/auto-enter.test.ts`
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Write the failing migration test for boolean `autoEnter`**

Add to `apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts`:

```ts
test('migrates legacy boolean autoEnter into autoEnterMode', async () => {
  storeGetQueryMock.mockResolvedValueOnce({
    rules: [
      {
        id: 'rule-a',
        name: 'Coding',
        activationApps: [
          {
            id: 'com.todesktop.230313mzl4w4u92',
            displayName: 'Cursor',
            platform: 'macos',
            source: 'detected'
          }
        ],
        customInstructions: '',
        autoEnter: true
      },
      {
        id: 'rule-b',
        name: 'Writing',
        activationApps: [
          {
            id: 'company.thebrowser.Browser',
            displayName: 'Arc',
            platform: 'macos',
            source: 'detected'
          }
        ],
        customInstructions: '',
        autoEnter: false
      }
    ]
  })

  const { instructionsStore } = await import('../instructions-store')
  await instructionsStore.getState().hydrate()

  expect(instructionsStore.getState().data.rules).toEqual([
    expect.objectContaining({ id: 'rule-a', autoEnterMode: 'enter' }),
    expect.objectContaining({ id: 'rule-b', autoEnterMode: 'off' })
  ])
})
```

- [ ] **Step 2: Write the failing send-key mode test**

Add to `apps/desktop/src/main/__tests__/auto-enter.test.ts`:

```ts
test('runs the macOS mod-enter command', async () => {
  const execFile = vi.fn((_file, _args, callback) => callback(null, '', ''))
  const service = createAutoEnterService({ platform: 'darwin', execFile })

  await service.triggerAutoEnter('mod-enter')

  expect(execFile).toHaveBeenCalledWith(
    'osascript',
    [
      '-e',
      'tell application "System Events" to keystroke return using command down'
    ],
    expect.any(Function)
  )
})
```

- [ ] **Step 3: Write the failing pipeline mode test**

Add to `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`:

```ts
test('triggers mod-enter when the matched rule requests it', async () => {
  const repository = {
    create: vi.fn(() => ({ id: 'record-mod-enter' })),
    update: vi.fn()
  }
  const triggerAutoEnter = vi.fn().mockResolvedValue(undefined)

  const pipeline = new PostRecordingPipeline({
    historyRepository: repository as never,
    recordingStorage: {
      save: vi.fn().mockResolvedValue({ audioFilePath: '/recordings/mod-enter.wav' })
    } as never,
    resolveActiveASRProvider: vi.fn().mockResolvedValue({
      id: 'deepgram',
      displayName: 'Deepgram',
      recognize: vi.fn().mockResolvedValue({
        text: 'send update',
        segments: [{ text: 'send update', isFinal: true }]
      })
    }),
    resolveActiveLLMSelection: vi.fn().mockResolvedValue({
      provider: {
        id: 'openai',
        displayName: 'OpenAI',
        generate: vi.fn().mockResolvedValue({
          content: 'Send update.',
          finishReason: 'stop',
          usage: undefined
        })
      },
      model: 'gpt-4.1'
    }),
    resolveMatchedInstruction: vi.fn().mockResolvedValue({
      ruleId: 'rule-mail',
      name: 'Mail',
      customInstructions: '',
      autoEnterMode: 'mod-enter'
    }),
    autoEnterService: {
      triggerAutoEnter
    }
  } as never)

  await pipeline.process({
    format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
    chunks: [new Uint8Array([1, 2])],
    startedAt: '2026-04-04T10:00:00.000Z',
    endedAt: '2026-04-04T10:00:01.000Z',
    durationMs: 1000
  })

  expect(triggerAutoEnter).toHaveBeenCalledWith('mod-enter')
})
```

- [ ] **Step 4: Run the targeted tests and verify they fail**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts apps/desktop/src/main/__tests__/auto-enter.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected: FAIL because the schema and runtime still use the boolean model.

- [ ] **Step 5: Implement the schema migration and mode-based runtime**

Update `apps/desktop/src/shared/instructions.ts`:

```ts
export type AutoEnterMode = 'off' | 'enter' | 'mod-enter'

export interface InstructionRule {
  id: string
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnterMode: AutoEnterMode
}
```

In `normalizeInstructionsSettings`, derive the mode like this:

```ts
function normalizeAutoEnterMode(rawRule: Record<string, unknown>): AutoEnterMode {
  if (rawRule.autoEnterMode === 'enter' || rawRule.autoEnterMode === 'mod-enter') {
    return rawRule.autoEnterMode
  }

  if (rawRule.autoEnter === true) {
    return 'enter'
  }

  return 'off'
}
```

Then write the normalized rule:

```ts
rules.push({
  id: typeof rawRule.id === 'string' ? rawRule.id : '',
  name,
  activationApps,
  customInstructions:
    typeof rawRule.customInstructions === 'string' ? rawRule.customInstructions : '',
  autoEnterMode: normalizeAutoEnterMode(rawRule)
})
```

Update `apps/desktop/src/main/send-key/auto-enter.ts`:

```ts
export type AutoEnterTriggerMode = 'enter' | 'mod-enter'

export interface AutoEnterService {
  triggerAutoEnter: (mode: AutoEnterTriggerMode) => Promise<void>
}
```

Use explicit mode branching:

```ts
if (platform === 'darwin') {
  return {
    triggerAutoEnter: (mode) =>
      mode === 'mod-enter'
        ? runExecFile(execFile, 'osascript', [
            '-e',
            'tell application "System Events" to keystroke return using command down'
          ])
        : runExecFile(execFile, 'osascript', [
            '-e',
            'tell application "System Events" to key code 36'
          ])
  }
}

if (platform === 'win32') {
  return {
    triggerAutoEnter: (mode) =>
      runExecFile(execFile, 'powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        mode === 'mod-enter'
          ? '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\"^{ENTER}\")'
          : '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\"{ENTER}\")'
      ])
  }
}
```

Update `apps/desktop/src/main/post-recording-pipeline.ts`:

```ts
const customInstructions = matchedInstruction?.customInstructions.trim()
const systemPrompt = customInstructions
  ? `${cleanupPrompt}\n\nMatched app instructions:\n${customInstructions}`
  : cleanupPrompt
```

And on success:

```ts
const autoEnterMode = matchedInstruction?.autoEnterMode ?? 'off'
const autoEnterRequested = autoEnterMode !== 'off'

if (autoEnterRequested && this.deps.autoEnterService) {
  await this.deps.autoEnterService.triggerAutoEnter(autoEnterMode)
}
```

Update debug metadata:

```ts
const matchedInstructionDebug = matchedInstruction
  ? {
      ruleId: matchedInstruction.ruleId,
      name: matchedInstruction.name,
      autoEnterMode: matchedInstruction.autoEnterMode,
      customInstructions: matchedInstruction.customInstructions
    }
  : null
```

- [ ] **Step 6: Run the targeted tests and verify they pass**

Run:

```bash
pnpm vitest run apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts apps/desktop/src/main/__tests__/auto-enter.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the schema and runtime mode change**

Run:

```bash
git add apps/desktop/src/shared/instructions.ts \
  apps/desktop/src/renderer/src/stores/instructions-store.ts \
  apps/desktop/src/renderer/src/stores/__tests__/instructions-store.test.ts \
  apps/desktop/src/main/send-key/auto-enter.ts \
  apps/desktop/src/main/__tests__/auto-enter.test.ts \
  apps/desktop/src/main/post-recording-pipeline.ts \
  apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
git commit -m "feat(instructions): add auto enter modes"
```

---

### Task 2: Convert Activation App Selection To Popover With Icons

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx`
- Modify: `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`

- [ ] **Step 1: Write the failing popover-and-icon test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('opens activation app selection in a popover and renders app icons', async () => {
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

  expect(screen.queryByText('Cursor')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))

  expect(screen.getByText('Cursor')).toBeTruthy()
  expect(screen.getAllByAltText('Cursor icon').length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the page test and verify it fails**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
```

Expected: FAIL because app selection is still always expanded and icon rendering is absent.

- [ ] **Step 3: Implement popover-based activation app selection**

Update `apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx` to use `Popover` primitives from `@openbroca/ui`:

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

Wrap the command list behind a trigger:

```tsx
<div className="flex flex-col gap-3">
  <div className="flex flex-wrap gap-2">
    {value.length > 0 ? value.map(/* chips */) : <p className="text-sm text-muted-foreground">No activation apps selected yet.</p>}
  </div>

  <div className="flex flex-wrap items-center justify-between gap-3">
    <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Select apps
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-3rem))] p-0">
        <Command className="rounded-none border-0 p-2">
          {/* input + list */}
        </Command>
      </PopoverContent>
    </Popover>

    <Button type="button" size="sm" variant="outline" onClick={() => setIsManualDialogOpen(true)}>
      Add manual app
    </Button>
  </div>
</div>
```

Render icons in list rows and selected chips:

```tsx
function AppIcon({ app }: { app: InstructionActivationApp }) {
  return app.iconDataUrl ? (
    <img src={app.iconDataUrl} alt={`${app.displayName} icon`} className="size-4 rounded-sm" />
  ) : (
    <span className="size-4 rounded-sm bg-muted" aria-hidden="true" />
  )
}
```

Use it in both chips and command rows:

```tsx
<Badge key={app.id} variant="outline" className="h-auto gap-2 py-1.5">
  <AppIcon app={app} />
  <span>{app.displayName}</span>
  <Button ...>Remove</Button>
</Badge>
```

```tsx
<CommandItem ...>
  <AppIcon app={app} />
  <div className="min-w-0 flex-1">...</div>
</CommandItem>
```

- [ ] **Step 4: Keep icon visibility consistent in manual and card views**

Update `apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx` so newly added manual apps render through the same icon-aware chip path after selection. No new manual icon upload is needed; use the placeholder when `iconDataUrl` is missing.

Update `apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx`:

```tsx
{rule.activationApps.map((app) => (
  <Badge key={app.id} variant="outline" className="gap-2">
    {app.iconDataUrl ? (
      <img src={app.iconDataUrl} alt={`${app.displayName} icon`} className="size-4 rounded-sm" />
    ) : (
      <span className="size-4 rounded-sm bg-muted" aria-hidden="true" />
    )}
    {app.displayName}
  </Badge>
))}
```

- [ ] **Step 5: Run the page test and verify it passes**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the popover and icon UI**

Run:

```bash
git add apps/desktop/src/renderer/src/components/instructions/activation-app-picker.tsx \
  apps/desktop/src/renderer/src/components/instructions/manual-app-dialog.tsx \
  apps/desktop/src/renderer/src/components/instructions/instruction-card.tsx \
  apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx
git commit -m "feat(instructions): use popover app selection"
```

---

### Task 3: Update The Instructions Form And Runtime Wiring For `autoEnterMode`

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/instructions.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write the failing UI-mode test**

Add to `apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx`:

```ts
test('stores mod-enter when auto enter is enabled and Cmd/Ctrl+Enter is selected', async () => {
  const { Instructions } = await import('../instructions')

  render(<Instructions />)

  fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mail reply' } })
  fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Cursor' }))
  fireEvent.click(screen.getByRole('switch', { name: 'Auto enter' }))
  fireEvent.change(screen.getByLabelText('Auto enter send key'), {
    target: { value: 'mod-enter' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create instruction' }))

  await waitFor(() => {
    expect(instructionsStoreMock.getState().replace).toHaveBeenCalled()
  })

  const nextSettings = vi.mocked(instructionsStoreMock.getState().replace).mock.calls.at(-1)?.[0]
  expect(nextSettings.rules[0]).toMatchObject({
    name: 'Mail reply',
    autoEnterMode: 'mod-enter'
  })
})
```

- [ ] **Step 2: Run the page test and verify it fails**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
```

Expected: FAIL because the form still persists `autoEnter`.

- [ ] **Step 3: Implement the `Switch + Select` UI model**

Update `apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx`:

```tsx
type AutoEnterMode = 'off' | 'enter' | 'mod-enter'

export interface InstructionEditorValue {
  name: string
  activationApps: InstructionActivationApp[]
  customInstructions: string
  autoEnterMode: AutoEnterMode
}
```

Map rule state into draft:

```tsx
function toDraft(rule: InstructionRule | null): InstructionEditorValue {
  return {
    name: rule?.name ?? '',
    activationApps: rule?.activationApps ?? [],
    customInstructions: rule?.customInstructions ?? '',
    autoEnterMode: rule?.autoEnterMode ?? 'off'
  }
}
```

Replace the old switch-only field with:

```tsx
<Field orientation="horizontal">
  <FieldLabel htmlFor="instruction-rule-auto-enter">Auto enter</FieldLabel>
  <FieldContent>
    <Switch
      id="instruction-rule-auto-enter"
      checked={draft.autoEnterMode !== 'off'}
      onCheckedChange={(checked) =>
        setDraft((current) => ({
          ...current,
          autoEnterMode: checked
            ? current.autoEnterMode === 'off'
              ? 'enter'
              : current.autoEnterMode
            : 'off'
        }))
      }
    />
    <FieldDescription>Simulates pressing a send key after processing.</FieldDescription>
  </FieldContent>
</Field>

<Field>
  <FieldLabel htmlFor="instruction-rule-auto-enter-mode">Auto enter send key</FieldLabel>
  <FieldContent>
    <select
      id="instruction-rule-auto-enter-mode"
      value={draft.autoEnterMode === 'off' ? 'enter' : draft.autoEnterMode}
      disabled={draft.autoEnterMode === 'off'}
      onChange={(event) =>
        setDraft((current) => ({
          ...current,
          autoEnterMode: event.target.value as AutoEnterMode
        }))
      }
    >
      <option value="enter">Enter</option>
      <option value="mod-enter">Cmd/Ctrl + Enter</option>
    </select>
  </FieldContent>
</Field>
```

- [ ] **Step 4: Persist and display `autoEnterMode` end-to-end**

Update `apps/desktop/src/renderer/src/pages/main/instructions.tsx` save flow:

```tsx
const nextRule: InstructionRule = {
  id: editorState.rule?.id ?? createRuleId(),
  name: value.name,
  activationApps: value.activationApps,
  customInstructions: value.customInstructions,
  autoEnterMode: value.autoEnterMode
}
```

Update `apps/desktop/src/main/index.ts` only if the matcher wiring requires renamed types from earlier tasks; otherwise keep runtime construction untouched.

Update the card label in `instruction-card.tsx` if needed:

```tsx
const autoEnterLabel =
  rule.autoEnterMode === 'off'
    ? 'Auto enter off'
    : rule.autoEnterMode === 'enter'
      ? 'Auto enter: Enter'
      : 'Auto enter: Cmd/Ctrl + Enter'
```

- [ ] **Step 5: Run the page test, desktop tests, and typecheck**

Run:

```bash
pnpm --filter desktop exec vitest run src/renderer/src/pages/main/__tests__/instructions.test.tsx --config vitest.config.ts
pnpm --filter desktop test
pnpm --filter desktop typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the UI/rule-mode wiring**

Run:

```bash
git add apps/desktop/src/renderer/src/components/instructions/instruction-editor-dialog.tsx \
  apps/desktop/src/renderer/src/pages/main/instructions.tsx \
  apps/desktop/src/renderer/src/pages/main/__tests__/instructions.test.tsx \
  apps/desktop/src/main/index.ts
git commit -m "feat(instructions): add auto enter send key mode"
```

---

## Self-Review

- Spec coverage:
  - popover-based activation app selection: Task 2
  - icon rendering for activation apps: Task 2
  - `autoEnterMode` enum and migration: Task 1
  - `Switch + Select` UI for send key: Task 3
  - runtime support for `enter` and `mod-enter`: Task 1
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” markers remain
  - each task has explicit files, commands, and code blocks
- Type consistency:
  - `InstructionRule.autoEnterMode` is introduced in Task 1 and used consistently in Task 3
  - `AutoEnterService.triggerAutoEnter(mode)` is introduced in Task 1 and consumed by runtime after that

