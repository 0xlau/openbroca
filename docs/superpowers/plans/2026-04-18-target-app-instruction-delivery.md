# Target-App Instruction Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop voice pipeline match `Instructions` against the focused editable target app, inject final LLM text into the current input when safe, fall back to clipboard when not, and surface clipboard fallback through a dedicated notify window.

**Architecture:** Keep the feature split into four bounded areas. First, align shared contracts so instruction matching, history debug, and bridge state all speak in terms of `targetApp`. Second, add a `FinalTextDeliveryService` that owns delivery-time policy, using clipboard-backed paste injection plus optional auto-send. Third, wire that service into `PostRecordingPipeline` so prompt-time instruction selection and delivery-time safety checks are both recorded. Fourth, add a single-instance notify-window path with its own main-process controller, preload bridge, renderer store, route, and focused tests.

**Tech Stack:** Electron, React, React Router, Zustand, TypeScript, Vitest, Testing Library, `electron` clipboard/ipc/window APIs, `osascript` on macOS, PowerShell / WScript.Shell on Windows

---

## Final State

This plan has now been executed and the document has been updated to reflect the landed implementation.

The task breakdown below still shows the original execution structure, but the feature ended with several review-driven improvements beyond the first-pass task text:

- `debug.delivery` uses `pending` defaults before any delivery attempt happens
- `FinalTextDeliveryService` preserves and restores the full clipboard payload, not only plain text
- delivery failure handling now always returns structured results instead of leaking exceptions
- `targetAppSnapshot` is frozen at processing handoff, not re-resolved later
- notify window dismiss now closes the window and resets bridge state instead of leaving a hidden `BrowserWindow`
- instruction ownership / transfer semantics now align with runtime stable-identity matching across `id`, `bundleId`, `aumid`, and `path`

Use the `Final State Notes` blocks under each task as the authoritative as-built summary when reading this document after implementation.

## File Structure

### New Files

- `apps/desktop/src/shared/notify-window-state.ts`
  Shared notification payload and bridge-state contract for the notify window.
- `apps/desktop/src/main/final-text-delivery/service.ts`
  Main-process delivery policy service that re-resolves `targetApp`, injects text, falls back to clipboard, and optionally auto-sends.
- `apps/desktop/src/main/final-text-delivery/platform/macos.ts`
  macOS paste helper that uses `osascript` to paste into the current focused input without stealing app focus.
- `apps/desktop/src/main/final-text-delivery/platform/windows.ts`
  Windows paste helper that uses PowerShell / `WScript.Shell.SendKeys("^v")`.
- `apps/desktop/src/main/notify-windows.ts`
  Single-instance notify-window controller that owns window creation, state updates, and auto-dismiss behavior.
- `apps/desktop/src/main/windows/notify-window.ts`
  Electron window factory for the notify surface.
- `apps/desktop/src/main/__tests__/final-text-delivery-service.test.ts`
  Focused delivery-service tests for inject, fallback, clipboard, and auto-send behavior.
- `apps/desktop/src/main/__tests__/notify-windows.test.ts`
  Focused notify-window controller tests for single-instance replacement and auto-dismiss behavior.
- `apps/desktop/src/main/__tests__/history-repository.test.ts`
  Focused repository test for the seeded `debug.delivery` shape.
- `apps/desktop/src/renderer/src/stores/notify-window-store.ts`
  Renderer store for notify-window bridge state.
- `apps/desktop/src/renderer/src/stores/__tests__/notify-window-store.test.ts`
  Focused store tests for initial load and live update behavior.
- `apps/desktop/src/renderer/src/pages/notify/notify-window.tsx`
  Notify-window renderer page.
- `apps/desktop/src/renderer/src/pages/notify/__tests__/notify-window.test.tsx`
  Renderer tests for title/body rendering and reserved action area behavior.

### Modified Files

- `apps/desktop/src/shared/voice-history.ts`
  Add `debug.delivery` types.
- `apps/desktop/src/main/history-repository.ts`
  Seed `debug.delivery` in default history records.
- `apps/desktop/src/main/instructions/matcher.ts`
  Treat the optional input parameter as the target-app snapshot used for matching, not just a frontmost-app snapshot.
- `apps/desktop/src/main/__tests__/instructions-matcher.test.ts`
  Update matcher tests to prove explicit target-app snapshots are used.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Resolve matched instructions from `targetAppAtMatch`, call `FinalTextDeliveryService`, and persist delivery debug.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Cover prompt augmentation, delivery success, delivery fallback, and clipboard-notify outcomes.
- `apps/desktop/src/main/recording-types.ts`
  Add `targetAppSnapshot` to the captured-recording payload.
- `apps/desktop/src/main/listening-session.ts`
  Capture `targetAppSnapshot` before dispatching `onRecordingComplete`.
- `apps/desktop/src/main/__tests__/listening-session.test.ts`
  Cover target-app snapshot capture on recording completion.
- `apps/desktop/src/main/index.ts`
  Instantiate the new delivery service and notify-window controller, wire them into the pipeline, and expose notify bridge handlers.
- `apps/desktop/src/main/windows/index.ts`
  Export the notify-window factory.
- `apps/desktop/src/preload/index.ts`
  Expose `notifyWindow.getState()` and `notifyWindow.onStateChange()`.
- `apps/desktop/src/preload/index.d.ts`
  Type the notify-window preload bridge.
- `apps/desktop/src/renderer/src/router/index.tsx`
  Add the notify-window route.
- `apps/desktop/src/renderer/src/main.tsx`
  No shell change expected; keep rendering via the router root only.
- `apps/desktop/src/renderer/src/stores/listening-session-store.ts`
  No feature change expected; use its existing bridge pattern as the notify-store model.

### Keep Behavior Stable

- `FloatListening` keeps showing the existing `targetApp` icon path.
- `Instructions` editor/store schema stays unchanged.
- No system notification API is introduced.
- No streaming partial text delivery is introduced.

## Task 1: Align Shared Contracts, Matcher Semantics, And History Debug

**Files:**
- Modify: `apps/desktop/src/main/instructions/matcher.ts`
- Modify: `apps/desktop/src/main/__tests__/instructions-matcher.test.ts`
- Modify: `apps/desktop/src/shared/voice-history.ts`
- Modify: `apps/desktop/src/main/history-repository.ts`
- Create: `apps/desktop/src/main/__tests__/history-repository.test.ts`

- [ ] **Step 1: Add failing matcher and history-shape tests**

Update `apps/desktop/src/main/__tests__/instructions-matcher.test.ts` with:

```ts
test('uses the explicit target-app snapshot without calling getFrontmostApp', async () => {
  const getFrontmostApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue({
    id: 'wrong-app',
    displayName: 'Wrong App',
    platform: 'macos',
    source: 'detected'
  })

  const matchInstruction = createInstructionMatcher({
    getInstructions: () => ({
      rules: [
        {
          id: 'rule-chat',
          name: 'Chat',
          activationApps: [
            {
              id: 'com.openai.chat',
              displayName: 'ChatGPT',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Use chat phrasing.',
          autoEnterMode: 'enter'
        }
      ]
    }),
    getFrontmostApp
  })

  await expect(
    matchInstruction({
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      source: 'detected'
    })
  ).resolves.toEqual(
    expect.objectContaining({
      ruleId: 'rule-chat',
      autoEnterMode: 'enter'
    })
  )

  expect(getFrontmostApp).not.toHaveBeenCalled()
})
```

Create `apps/desktop/src/main/__tests__/history-repository.test.ts` with:

```ts
test('seeds a delivery debug object on create', () => {
  const store = new MemoryStore()
  const repository = new HistoryRepository(store)

  const record = repository.create({
    status: 'processing',
    audioDurationMs: 1000,
    asrProviderId: undefined,
    llmProviderId: undefined
  })

  expect(record.debug.delivery).toEqual({
    targetAppAtMatch: null,
    targetAppAtDelivery: null,
    matchedInstruction: null,
    method: 'pending',
    status: 'pending',
    autoSendTriggered: false
  })
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/instructions-matcher.test.ts src/main/__tests__/history-repository.test.ts`
Expected: FAIL because the matcher test still describes "frontmost" semantics and `debug.delivery` does not exist on history records.

- [ ] **Step 3: Implement the shared delivery debug contract**

Update `apps/desktop/src/shared/voice-history.ts`:

```ts
export type VoiceHistoryDeliveryDebug = {
  targetAppAtMatch: Record<string, unknown> | null
  targetAppAtDelivery: Record<string, unknown> | null
  matchedInstruction: {
    ruleId: string
    name: string
    autoEnterMode: 'off' | 'enter' | 'mod-enter'
  } | null
  method: 'pending' | 'inject-only' | 'inject-and-send' | 'clipboard'
  status: 'pending' | 'completed' | 'fallback' | 'failed'
  autoSendTriggered: boolean
  failureMessage?: string
}

export interface VoiceHistoryDebugData {
  rawTranscriptionText: string
  asrSegments: Array<{ text: string; startTime?: number; endTime?: number; isFinal: boolean }>
  asrRequest: Record<string, unknown>
  asrResponseSummary: Record<string, unknown>
  llmRequest: Record<string, unknown>
  llmResponseSummary: Record<string, unknown>
  delivery: VoiceHistoryDeliveryDebug
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  timeline: Array<{
    stage: 'storage' | 'asr' | 'llm'
    status: 'started' | 'completed' | 'failed'
    at: string
    message?: string
  }>
  errors: Array<{ stage: Exclude<VoiceHistoryFailureStage, null>; message: string; at: string }>
}
```

Update `apps/desktop/src/main/history-repository.ts`:

```ts
debug: {
  rawTranscriptionText: '',
  asrSegments: [],
  asrRequest: {},
  asrResponseSummary: {},
  llmRequest: {},
  llmResponseSummary: {},
  delivery: {
    targetAppAtMatch: null,
    targetAppAtDelivery: null,
    matchedInstruction: null,
    method: 'pending',
    status: 'pending',
    autoSendTriggered: false
  },
  timeline: [],
  errors: []
}
```

- [ ] **Step 4: Rename matcher semantics around target-app snapshots**

Update `apps/desktop/src/main/instructions/matcher.ts`:

```ts
export function createInstructionMatcher(
  deps: InstructionMatcherDeps
): (targetAppSnapshot?: AppIdentity | null) => Promise<MatchedInstructionRule | null> {
  return async (targetAppSnapshot) => {
    const targetApp =
      targetAppSnapshot === undefined ? await deps.getFrontmostApp() : targetAppSnapshot

    if (!targetApp?.id) {
      return null
    }

    const matches = deps
      .getInstructions()
      .rules.filter((rule) => rule.activationApps.some((app) => appIdentityMatches(app, targetApp)))

    if (matches.length !== 1) {
      return null
    }

    const [match] = matches
    return {
      ruleId: match.id,
      name: match.name,
      customInstructions: match.customInstructions,
      autoEnterMode: match.autoEnterMode ?? 'off'
    }
  }
}
```

Keep `getFrontmostApp` in the dependency shape for legacy callers that do not pass an explicit snapshot yet. Do not remove the fallback in this task.

- [ ] **Step 5: Re-run the focused tests**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/instructions-matcher.test.ts src/main/__tests__/history-repository.test.ts`
Expected: PASS with explicit target-app snapshot usage and seeded `debug.delivery`.

- [ ] **Step 6: Commit the contract and matcher groundwork**

```bash
git add apps/desktop/src/main/instructions/matcher.ts apps/desktop/src/main/__tests__/instructions-matcher.test.ts apps/desktop/src/shared/voice-history.ts apps/desktop/src/main/history-repository.ts apps/desktop/src/main/__tests__/history-repository.test.ts
git commit -m "feat: add target-app delivery debug contract"
```

**Final State Notes**

- Task 1 landed across three commits:
  - `270ee6b` initial contract + matcher groundwork
  - `14254a6` legacy `voiceHistory` backfill on read
  - `05fc207` pending delivery defaults instead of fabricated failure defaults
- `HistoryRepository.read()` now normalizes legacy records missing `debug.delivery` and persists the repaired state back to storage.
- `MatchedInstructionRule` was later extended in Task 3 to include a normal enumerable `activationApp` field.

## Task 2: Add The Final Text Delivery Service With Clipboard-Backed Injection

**Files:**
- Create: `apps/desktop/src/main/final-text-delivery/service.ts`
- Create: `apps/desktop/src/main/final-text-delivery/platform/macos.ts`
- Create: `apps/desktop/src/main/final-text-delivery/platform/windows.ts`
- Create: `apps/desktop/src/main/__tests__/final-text-delivery-service.test.ts`

- [ ] **Step 1: Write the failing delivery-service tests first**

Create `apps/desktop/src/main/__tests__/final-text-delivery-service.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createFinalTextDeliveryService } from '../final-text-delivery/service'

describe('FinalTextDeliveryService', () => {
  test('injects text and auto-sends when the delivery target still matches the rule app', async () => {
    const pasteText = vi.fn().mockResolvedValue(undefined)
    const triggerAutoEnter = vi.fn().mockResolvedValue(undefined)
    const notifyClipboardFallback = vi.fn().mockResolvedValue(undefined)

    const service = createFinalTextDeliveryService({
      getTargetApp: vi.fn().mockResolvedValue({
        id: 'com.openai.chat',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected'
      }),
      pasteText,
      triggerAutoEnter,
      clipboard: {
        readText: vi.fn().mockReturnValue('before'),
        writeText: vi.fn()
      },
      notifyClipboardFallback
    })

    await expect(
      service.deliver({
        text: 'Send this now.',
        matchedInstruction: {
          ruleId: 'rule-chat',
          name: 'Chat',
          autoEnterMode: 'enter',
          customInstructions: 'Use chat phrasing.',
          activationApp: {
            id: 'com.openai.chat',
            displayName: 'ChatGPT',
            platform: 'macos',
            source: 'detected'
          }
        },
        targetAppAtMatch: {
          id: 'com.openai.chat',
          displayName: 'ChatGPT',
          platform: 'macos',
          source: 'detected'
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        method: 'inject-and-send',
        status: 'completed',
        autoSendTriggered: true
      })
    )

    expect(pasteText).toHaveBeenCalledWith('Send this now.')
    expect(triggerAutoEnter).toHaveBeenCalledWith('enter')
    expect(notifyClipboardFallback).not.toHaveBeenCalled()
  })

  test('falls back to clipboard and notifies when the current target no longer matches the rule app', async () => {
    const writeText = vi.fn()
    const notifyClipboardFallback = vi.fn().mockResolvedValue(undefined)

    const service = createFinalTextDeliveryService({
      getTargetApp: vi.fn().mockResolvedValue({
        id: 'com.slack.desktop',
        displayName: 'Slack',
        platform: 'macos',
        source: 'detected'
      }),
      pasteText: vi.fn(),
      triggerAutoEnter: vi.fn(),
      clipboard: {
        readText: vi.fn().mockReturnValue('before'),
        writeText
      },
      notifyClipboardFallback
    })

    await expect(
      service.deliver({
        text: 'Send this now.',
        matchedInstruction: {
          ruleId: 'rule-chat',
          name: 'Chat',
          autoEnterMode: 'enter',
          customInstructions: 'Use chat phrasing.',
          activationApp: {
            id: 'com.openai.chat',
            displayName: 'ChatGPT',
            platform: 'macos',
            source: 'detected'
          }
        },
        targetAppAtMatch: {
          id: 'com.openai.chat',
          displayName: 'ChatGPT',
          platform: 'macos',
          source: 'detected'
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        method: 'clipboard',
        status: 'fallback',
        autoSendTriggered: false
      })
    )

    expect(writeText).toHaveBeenCalledWith('Send this now.')
    expect(notifyClipboardFallback).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Copied to clipboard' })
    )
  })
})
```

- [ ] **Step 2: Run the new test file and confirm it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/final-text-delivery-service.test.ts`
Expected: FAIL because the delivery service and platform files do not exist yet.

- [ ] **Step 3: Implement platform paste helpers**

Create `apps/desktop/src/main/final-text-delivery/platform/macos.ts`:

```ts
import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void

export function createMacPasteText(execFile: ExecFile = nodeExecFile as ExecFile) {
  return async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'osascript',
        ['-e', 'tell application "System Events" to keystroke "v" using command down'],
        (error) => (error ? reject(error) : resolve())
      )
    })
  }
}
```

Create `apps/desktop/src/main/final-text-delivery/platform/windows.ts`:

```ts
import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void

export function createWindowsPasteText(execFile: ExecFile = nodeExecFile as ExecFile) {
  return async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("^v")'
        ],
        (error) => (error ? reject(error) : resolve())
      )
    })
  }
}
```

- [ ] **Step 4: Implement the delivery policy service**

Create `apps/desktop/src/main/final-text-delivery/service.ts`:

```ts
import type { AppIdentity } from '@openbroca/app-identity'
import type { ActionableAutoEnterMode } from '../send-key/auto-enter'

type DeliveryInstruction = {
  ruleId: string
  name: string
  autoEnterMode: 'off' | 'enter' | 'mod-enter'
  customInstructions: string
  activationApp: AppIdentity
}

type DeliveryRequest = {
  text: string
  matchedInstruction: DeliveryInstruction | null
  targetAppAtMatch: AppIdentity | null
}

type DeliveryResult = {
  targetAppAtMatch: AppIdentity | null
  targetAppAtDelivery: AppIdentity | null
  matchedInstruction: Omit<DeliveryInstruction, 'customInstructions' | 'activationApp'> | null
  method: 'inject-only' | 'inject-and-send' | 'clipboard'
  status: 'completed' | 'fallback' | 'failed'
  autoSendTriggered: boolean
  failureMessage?: string
}

function sameApp(left: AppIdentity | null, right: AppIdentity | null): boolean {
  if (!left || !right) return false
  return Boolean(
    (left.id && right.id && left.id === right.id) ||
      (left.bundleId && right.bundleId && left.bundleId === right.bundleId) ||
      (left.aumid && right.aumid && left.aumid === right.aumid) ||
      (left.path && right.path && left.path === right.path)
  )
}

export function createFinalTextDeliveryService(deps: {
  getTargetApp: () => Promise<AppIdentity | null>
  pasteText: (text: string) => Promise<void>
  triggerAutoEnter: (mode: ActionableAutoEnterMode) => Promise<void>
  clipboard: { readText: () => string; writeText: (value: string) => void }
  notifyClipboardFallback: (payload: { title: string; body?: string }) => Promise<void> | void
}) {
  return {
    async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
      const targetAppAtDelivery = await deps.getTargetApp()
      const matchedInstruction = request.matchedInstruction
        ? {
            ruleId: request.matchedInstruction.ruleId,
            name: request.matchedInstruction.name,
            autoEnterMode: request.matchedInstruction.autoEnterMode
          }
        : null

      if (!targetAppAtDelivery) {
        deps.clipboard.writeText(request.text)
        await deps.notifyClipboardFallback({ title: 'Copied to clipboard' })
        return {
          targetAppAtMatch: request.targetAppAtMatch,
          targetAppAtDelivery,
          matchedInstruction,
          method: 'clipboard',
          status: 'fallback',
          autoSendTriggered: false
        }
      }

      if (
        request.matchedInstruction &&
        !sameApp(targetAppAtDelivery, request.matchedInstruction.activationApp)
      ) {
        deps.clipboard.writeText(request.text)
        await deps.notifyClipboardFallback({ title: 'Copied to clipboard' })
        return {
          targetAppAtMatch: request.targetAppAtMatch,
          targetAppAtDelivery,
          matchedInstruction,
          method: 'clipboard',
          status: 'fallback',
          autoSendTriggered: false
        }
      }

      const previousClipboardText = deps.clipboard.readText()

      try {
        deps.clipboard.writeText(request.text)
        await deps.pasteText(request.text)

        if (!request.matchedInstruction || request.matchedInstruction.autoEnterMode === 'off') {
          deps.clipboard.writeText(previousClipboardText)
          return {
            targetAppAtMatch: request.targetAppAtMatch,
            targetAppAtDelivery,
            matchedInstruction,
            method: 'inject-only',
            status: 'completed',
            autoSendTriggered: false
          }
        }

        await deps.triggerAutoEnter(request.matchedInstruction.autoEnterMode)
        deps.clipboard.writeText(previousClipboardText)
        return {
          targetAppAtMatch: request.targetAppAtMatch,
          targetAppAtDelivery,
          matchedInstruction,
          method: 'inject-and-send',
          status: 'completed',
          autoSendTriggered: true
        }
      } catch (error) {
        deps.clipboard.writeText(request.text)
        await deps.notifyClipboardFallback({ title: 'Copied to clipboard' })
        return {
          targetAppAtMatch: request.targetAppAtMatch,
          targetAppAtDelivery,
          matchedInstruction,
          method: 'clipboard',
          status: 'fallback',
          autoSendTriggered: false,
          failureMessage: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }
}
```

- [ ] **Step 5: Re-run the delivery-service tests**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/final-text-delivery-service.test.ts`
Expected: PASS with one inject-and-send path and one clipboard-fallback path.

- [ ] **Step 6: Commit the delivery service**

```bash
git add apps/desktop/src/main/final-text-delivery/service.ts apps/desktop/src/main/final-text-delivery/platform/macos.ts apps/desktop/src/main/final-text-delivery/platform/windows.ts apps/desktop/src/main/__tests__/final-text-delivery-service.test.ts
git commit -m "feat: add final text delivery service"
```

**Final State Notes**

- The final delivery service implementation evolved beyond the initial sketch in this plan.
- The landed service:
  - snapshots and restores the full clipboard payload, not only plain text
  - distinguishes `inject-only`, `inject-and-send`, successful `clipboard` fallback, and true `failed` outcomes
  - returns structured results when `getTargetApp()`, paste injection, clipboard fallback, notify callback, or clipboard restore fail
  - treats auto-enter failure after successful paste as injected text with `autoSendTriggered: false`, not as clipboard fallback
  - keeps the approved product behavior that when `matchedInstruction` is `null`, delivery may still inject into the current target app
- Task 2 landed across several review-driven commits:
  - `63a115d`, `ea4aa56`, `40163a1`, `6985666`, `90bdf93`, `3c4381c`, `9b8eb7d`
- The focused service test file grew into the authoritative contract suite for delivery semantics and platform helper command strings.

## Task 3: Wire Delivery Into The Post-Recording Pipeline

**Files:**
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
- Modify: `apps/desktop/src/main/recording-types.ts`
- Modify: `apps/desktop/src/main/listening-session.ts`
- Modify: `apps/desktop/src/main/__tests__/listening-session.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Add the failing pipeline tests for prompt-time target-app matching and delivery debug**

Extend `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts` with:

```ts
test('uses target-app snapshot to add matched instructions and records delivery debug', async () => {
  const deliver = vi.fn().mockResolvedValue({
    targetAppAtMatch: {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      source: 'detected'
    },
    targetAppAtDelivery: {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      source: 'detected'
    },
    matchedInstruction: {
      ruleId: 'rule-chat',
      name: 'Chat',
      autoEnterMode: 'enter'
    },
    method: 'inject-and-send',
    status: 'completed',
    autoSendTriggered: true
  })

  const repository = {
    create: vi.fn(() => ({ id: 'record-delivery' })),
    update: vi.fn()
  }

  const pipeline = new PostRecordingPipeline({
    historyRepository: repository as never,
    recordingStorage: {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/delivery.wav',
        fileName: 'delivery.wav',
        byteLength: 64
      })
    } as never,
    resolveActiveASRSelection: vi.fn().mockResolvedValue({
      provider: {
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize: vi.fn().mockResolvedValue({
          text: 'send this now',
          segments: [{ text: 'send this now', isFinal: true }]
        })
      },
      settings: {}
    }),
    resolveActiveLLMSelection: vi.fn().mockResolvedValue({
      provider: {
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        isConfigured: () => true,
        listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
        generate: vi.fn().mockResolvedValue({
          content: 'Send this now.',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 }
        })
      },
      model: 'gpt-5.2-codex'
    }),
    resolveMatchedInstruction: vi.fn().mockResolvedValue({
      ruleId: 'rule-chat',
      name: 'Chat',
      customInstructions: 'Use chat phrasing.',
      autoEnterMode: 'enter',
      activationApp: {
        id: 'com.openai.chat',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected'
      }
    }),
    finalTextDeliveryService: { deliver }
  } as never)

  await pipeline.process({
    format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
    chunks: [new Uint8Array([1, 2])],
    startedAt: '2026-04-18T10:00:00.000Z',
    endedAt: '2026-04-18T10:00:01.000Z',
    durationMs: 1000,
    frontmostAppSnapshot: {
      id: 'frontmost-app',
      displayName: 'Frontmost',
      platform: 'macos',
      source: 'detected'
    },
    targetAppSnapshot: {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      source: 'detected'
    }
  } as never)

  expect(deliver).toHaveBeenCalledWith(
    expect.objectContaining({
      text: 'Send this now.',
      targetAppAtMatch: expect.objectContaining({ id: 'com.openai.chat' })
    })
  )
  expect(repository.update).toHaveBeenLastCalledWith(
    'record-delivery',
    expect.objectContaining({
      status: 'completed',
      debug: expect.objectContaining({
        delivery: expect.objectContaining({
          method: 'inject-and-send',
          autoSendTriggered: true
        })
      })
    })
  )
})
```

- [ ] **Step 2: Run the focused pipeline test and confirm it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/post-recording-pipeline.test.ts`
Expected: FAIL because `targetAppSnapshot` is not part of the captured recording shape, `finalTextDeliveryService` is not a dependency, and `debug.delivery` is not updated.

- [ ] **Step 3: Wire target-app snapshots and delivery service into the pipeline**

Update `apps/desktop/src/main/post-recording-pipeline.ts`:

```ts
finalTextDeliveryService?: {
  deliver: (request: {
    text: string
    matchedInstruction: {
      ruleId: string
      name: string
      autoEnterMode: 'off' | 'enter' | 'mod-enter'
      customInstructions: string
      activationApp: import('@openbroca/app-identity').AppIdentity
    } | null
    targetAppAtMatch: import('@openbroca/app-identity').AppIdentity | null
  }) => Promise<import('../shared/voice-history').VoiceHistoryDeliveryDebug>
}
```

Inside the LLM success branch:

```ts
const targetAppAtMatch = recording.targetAppSnapshot ?? null
const matchedInstruction = await this.deps.resolveMatchedInstruction?.(targetAppAtMatch)

const result = await llmProvider.generate(llmRequest)

const delivery = this.deps.finalTextDeliveryService
  ? await this.deps.finalTextDeliveryService.deliver({
      text: result.content,
      matchedInstruction,
      targetAppAtMatch
    })
  : {
      targetAppAtMatch,
      targetAppAtDelivery: null,
      matchedInstruction: matchedInstruction
        ? {
            ruleId: matchedInstruction.ruleId,
            name: matchedInstruction.name,
            autoEnterMode: matchedInstruction.autoEnterMode
          }
        : null,
      method: 'pending',
      status: 'failed',
      autoSendTriggered: false,
      failureMessage: 'service-unavailable'
    }

this.deps.historyRepository.update(record.id, {
  status: 'completed',
  finalText: result.content,
  debug: {
    llmRequest: buildLLMRequestDebug(),
    llmResponseSummary: {
      finishReason: result.finishReason,
      matchedInstruction: matchedInstructionDebug
    },
    delivery,
    tokenUsage: result.usage,
    timeline: [...timeline]
  }
})
```

Also update the matched-instruction type in `apps/desktop/src/main/instructions/matcher.ts` to include:

```ts
activationApp: AppIdentity
```

and return the exact matched activation app so delivery can compare against the same app family later.

- [ ] **Step 4: Add `targetAppSnapshot` to the captured recording contract and test it**

Update `apps/desktop/src/main/recording-types.ts`:

```ts
import type { AppIdentity } from '@openbroca/app-identity'

export interface CapturedRecording {
  format: {
    sampleRate: number
    channels: number
    bitDepth: number
  }
  chunks: Uint8Array[]
  startedAt: string
  endedAt: string
  durationMs: number
  frontmostAppSnapshot?: AppIdentity | null
  targetAppSnapshot?: AppIdentity | null
}
```

Extend `apps/desktop/src/main/__tests__/listening-session.test.ts` with:

```ts
test('captures targetAppSnapshot before dispatching onRecordingComplete', async () => {
  const onRecordingComplete = vi.fn().mockResolvedValue(undefined)
  const listeningSession = new ListeningSessionManager(captureSource, {
    getFrontmostAppSnapshot: vi.fn().mockResolvedValue(null),
    getTargetApp: vi.fn().mockResolvedValue({
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      source: 'detected'
    }),
    onRecordingComplete
  })

  listeningSession.start()
  await flushPromises()
  listeningSession.stop()
  await flushPromises()

  expect(onRecordingComplete).toHaveBeenCalledWith(
    expect.objectContaining({
      targetAppSnapshot: expect.objectContaining({ id: 'com.openai.chat' })
    }),
    expect.any(AbortSignal)
  )
})
```

- [ ] **Step 5: Capture `targetAppSnapshot` from the listening session and wire the service in `index.ts`**

In `apps/desktop/src/main/index.ts`, instantiate the service with Electron clipboard and platform paste helper:

```ts
import { clipboard, ipcMain } from 'electron'
import { createFinalTextDeliveryService } from './final-text-delivery/service'
import { createMacPasteText } from './final-text-delivery/platform/macos'
import { createWindowsPasteText } from './final-text-delivery/platform/windows'
```

```ts
const finalTextDeliveryService = createFinalTextDeliveryService({
  getTargetApp: () => focusedInputAppService.getFocusedInputApp(),
  pasteText:
    process.platform === 'darwin'
      ? async (text) => {
          clipboard.writeText(text)
          await createMacPasteText()()
        }
      : process.platform === 'win32'
        ? async (text) => {
            clipboard.writeText(text)
            await createWindowsPasteText()()
          }
        : async () => {
            throw new Error('unsupported-platform')
          },
  triggerAutoEnter: (mode) => autoEnterService.triggerAutoEnter(mode),
  clipboard,
  notifyClipboardFallback: (payload) => notifyWindows.show(payload)
})
```

Pass `finalTextDeliveryService` into `PostRecordingPipeline`.

In `apps/desktop/src/main/listening-session.ts`, when `getTargetApp` already exists, include the current target-app snapshot before dispatching `onRecordingComplete`:

```ts
let targetAppSnapshot: AppIdentity | null = null

if (this.options.getTargetApp) {
  try {
    targetAppSnapshot = await this.options.getTargetApp()
  } catch (error) {
    console.debug('[voice-debug] failed to capture target app snapshot', {
      error: normalizeErrorMessage(error)
    })
  }
}

await this.options.onRecordingComplete?.(
  {
    ...recording,
    frontmostAppSnapshot,
    targetAppSnapshot
  },
  controller.signal
)
```

- [ ] **Step 6: Re-run the focused pipeline tests**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/post-recording-pipeline.test.ts src/main/__tests__/listening-session.test.ts src/main/__tests__/instructions-matcher.test.ts src/main/__tests__/final-text-delivery-service.test.ts`
Expected: PASS with prompt-time target-app matching and persisted `debug.delivery`.

- [ ] **Step 7: Commit the pipeline integration**

```bash
git add apps/desktop/src/main/post-recording-pipeline.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/main/recording-types.ts apps/desktop/src/main/listening-session.ts apps/desktop/src/main/__tests__/listening-session.test.ts apps/desktop/src/main/index.ts apps/desktop/src/main/instructions/matcher.ts
git commit -m "feat: wire target-app delivery into voice pipeline"
```

**Final State Notes**

- `targetAppSnapshot` is now frozen from the already-tracked `ListeningSessionManager.targetApp` state at processing handoff, not re-resolved later in `completeRecording()`.
- `PostRecordingPipeline` now imports and reuses the delivery service type instead of carrying a duplicated inline shape.
- The pipeline fallback debug object uses `method: 'pending'` when no delivery attempt actually happened.
- `index.ts` intentionally used a no-op `notifyClipboardFallback` placeholder in Task 3 only; real notify-window wiring was added in Task 4.
- Task 3 landed as:
  - `775a6dc` initial integration
  - `06a8d36` enumerable `activationApp`
  - `a44a34b` snapshot freeze + fallback/type cleanup

## Task 4: Add The Single-Instance Notify Window And Renderer Bridge

**Files:**
- Create: `apps/desktop/src/shared/notify-window-state.ts`
- Create: `apps/desktop/src/main/notify-windows.ts`
- Create: `apps/desktop/src/main/windows/notify-window.ts`
- Create: `apps/desktop/src/main/__tests__/notify-windows.test.ts`
- Create: `apps/desktop/src/renderer/src/stores/notify-window-store.ts`
- Create: `apps/desktop/src/renderer/src/stores/__tests__/notify-window-store.test.ts`
- Create: `apps/desktop/src/renderer/src/pages/notify/notify-window.tsx`
- Create: `apps/desktop/src/renderer/src/pages/notify/__tests__/notify-window.test.tsx`
- Modify: `apps/desktop/src/main/windows/index.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/renderer/src/router/index.tsx`

- [ ] **Step 1: Write the failing notify-window controller and renderer tests**

Create `apps/desktop/src/main/__tests__/notify-windows.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createNotifyWindows } from '../notify-windows'

describe('createNotifyWindows', () => {
  test('reuses one window and replaces state when showing a new notification', async () => {
    const send = vi.fn()
    const showInactive = vi.fn()
    const fakeWindow = {
      isDestroyed: () => false,
      isVisible: () => false,
      showInactive,
      webContents: { send }
    }
    const createWindow = vi.fn(() => fakeWindow as never)

    const notifyWindows = createNotifyWindows({
      createWindow
    })

    await notifyWindows.show({ title: 'Copied to clipboard' })
    await notifyWindows.show({ title: 'Copied again', body: 'new text' })

    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith(
      'notify-window:state-changed',
      expect.objectContaining({
        notification: expect.objectContaining({ title: 'Copied again' })
      })
    )
    expect(showInactive).toHaveBeenCalled()
  })
})
```

Create `apps/desktop/src/renderer/src/pages/notify/__tests__/notify-window.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@renderer/stores/notify-window-store', () => ({
  notifyWindowStore: {
    getState: () => ({
      bridge: {
        notification: {
          title: 'Copied to clipboard',
          body: 'Could not update the current app directly.',
          actions: [{ id: 'retry', label: 'Retry' }]
        }
      }
    }),
    subscribe: vi.fn(() => () => {})
  }
}))

test('renders title, body, and reserved actions area', async () => {
  const { NotifyWindowPage } = await import('../notify-window')

  render(<NotifyWindowPage />)

  expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
  expect(screen.getByText('Could not update the current app directly.')).toBeInTheDocument()
  expect(screen.getByText('Retry')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused notify tests and confirm they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/notify-windows.test.ts src/renderer/src/pages/notify/__tests__/notify-window.test.tsx`
Expected: FAIL because the notify-window files and store do not exist yet.

- [ ] **Step 3: Add the shared notify bridge state and window factory**

Create `apps/desktop/src/shared/notify-window-state.ts`:

```ts
export type NotifyWindowAction = {
  id: string
  label: string
}

export type NotifyWindowNotification = {
  title: string
  body?: string
  actions?: NotifyWindowAction[]
}

export type NotifyWindowBridgeState = {
  notification: NotifyWindowNotification | null
}

export const INITIAL_NOTIFY_WINDOW_BRIDGE_STATE: NotifyWindowBridgeState = {
  notification: null
}
```

Create `apps/desktop/src/main/windows/notify-window.ts`:

```ts
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

export const NOTIFY_WINDOW_SIZE = { width: 320, height: 88 } as const

export function createNotifyWindow(): BrowserWindow {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const x = Math.round(display.workArea.x + (display.workArea.width - NOTIFY_WINDOW_SIZE.width) / 2)
  const y = Math.round(display.workArea.y + display.workArea.height - NOTIFY_WINDOW_SIZE.height - 110)

  const notifyWindow = new BrowserWindow({
    width: NOTIFY_WINDOW_SIZE.width,
    height: NOTIFY_WINDOW_SIZE.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    notifyWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/notify/window')
  } else {
    notifyWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/notify/window'
    })
  }

  return notifyWindow
}
```

- [ ] **Step 4: Implement the notify-window controller, preload bridge, and renderer store/page**

Create `apps/desktop/src/main/notify-windows.ts`:

```ts
import type { BrowserWindow } from 'electron'
import {
  INITIAL_NOTIFY_WINDOW_BRIDGE_STATE,
  type NotifyWindowBridgeState,
  type NotifyWindowNotification
} from '../shared/notify-window-state'
import { createNotifyWindow } from './windows/notify-window'

export function createNotifyWindows(deps: {
  createWindow?: () => BrowserWindow
  timeoutMs?: number
} = {}) {
  const createWindow = deps.createWindow ?? createNotifyWindow
  const timeoutMs = deps.timeoutMs ?? 2500
  let win: BrowserWindow | null = null
  let bridge: NotifyWindowBridgeState = INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
  let dismissTimer: ReturnType<typeof setTimeout> | null = null

  const publish = () => {
    win?.webContents.send('notify-window:state-changed', bridge)
  }

  const ensureWindow = () => {
    if (!win || win.isDestroyed()) {
      win = createWindow()
      win.on?.('closed', () => {
        win = null
      })
    }
    return win
  }

  const scheduleDismiss = () => {
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(() => {
      bridge = INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
      publish()
      win?.hide()
    }, timeoutMs)
  }

  return {
    getState: () => bridge,
    async show(notification: NotifyWindowNotification) {
      const window = ensureWindow()
      bridge = { notification }
      publish()
      if (!window.isVisible()) {
        window.showInactive()
      }
      scheduleDismiss()
    }
  }
}
```

Update `apps/desktop/src/preload/index.ts`:

```ts
notifyWindow: {
  getState: () => ipcRenderer.invoke('notify-window:get-state') as Promise<NotifyWindowBridgeState>,
  onStateChange: (callback: (state: NotifyWindowBridgeState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: NotifyWindowBridgeState) =>
      callback(state)

    ipcRenderer.on('notify-window:state-changed', handler)
    return () => ipcRenderer.removeListener('notify-window:state-changed', handler)
  }
}
```

Update `apps/desktop/src/preload/index.d.ts`:

```ts
import type { NotifyWindowBridgeState } from '../shared/notify-window-state'
```

```ts
notifyWindow: {
  getState: () => Promise<NotifyWindowBridgeState>
  onStateChange: (callback: (state: NotifyWindowBridgeState) => void) => () => void
}
```

Create `apps/desktop/src/renderer/src/stores/notify-window-store.ts`:

```ts
import { createStore } from 'zustand'
import {
  INITIAL_NOTIFY_WINDOW_BRIDGE_STATE,
  type NotifyWindowBridgeState
} from '../../../shared/notify-window-state'

export const notifyWindowStore = createStore<{ bridge: NotifyWindowBridgeState }>(() => ({
  bridge: INITIAL_NOTIFY_WINDOW_BRIDGE_STATE
}))

let initialized = false

function initializeNotifyWindowStore(): void {
  if (initialized || typeof window === 'undefined' || !window.api?.notifyWindow) {
    return
  }

  initialized = true
  let receivedLiveUpdate = false

  window.api.notifyWindow.onStateChange((bridge) => {
    receivedLiveUpdate = true
    notifyWindowStore.setState({ bridge })
  })

  void window.api.notifyWindow.getState().then((bridge) => {
    if (!receivedLiveUpdate) {
      notifyWindowStore.setState({ bridge })
    }
  })
}

const getState = notifyWindowStore.getState.bind(notifyWindowStore)
const subscribe = notifyWindowStore.subscribe.bind(notifyWindowStore)

notifyWindowStore.getState = () => {
  initializeNotifyWindowStore()
  return getState()
}

notifyWindowStore.subscribe = ((...args: Parameters<typeof subscribe>) => {
  initializeNotifyWindowStore()
  return subscribe(...args)
}) as typeof notifyWindowStore.subscribe
```

Create `apps/desktop/src/renderer/src/pages/notify/notify-window.tsx`:

```tsx
import React from 'react'
import { Button, cn } from '@openbroca/ui'
import { useStore } from 'zustand'
import { notifyWindowStore } from '@renderer/stores/notify-window-store'

export const NotifyWindowPage: React.FC = () => {
  const { bridge } = useStore(notifyWindowStore)
  const notification = bridge.notification

  if (!notification) {
    return <div className="h-screen w-screen bg-transparent" />
  }

  return (
    <div className="h-screen w-screen bg-transparent p-3">
      <div className={cn('bg-background/95 text-foreground rounded-2xl border px-4 py-3 shadow-xl')}>
        <div className="text-sm font-medium">{notification.title}</div>
        {notification.body ? <div className="text-muted-foreground mt-1 text-xs">{notification.body}</div> : null}
        {notification.actions?.length ? (
          <div className="mt-3 flex gap-2">
            {notification.actions.map((action) => (
              <Button key={action.id} size="sm" variant="secondary">
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

Update `apps/desktop/src/renderer/src/router/index.tsx`:

```tsx
import { NotifyWindowPage } from '@renderer/pages/notify/notify-window'
```

```tsx
{
  path: '/notify/window',
  element: <NotifyWindowPage />
}
```

- [ ] **Step 5: Wire the notify controller into `index.ts` and export the window factory**

Update `apps/desktop/src/main/windows/index.ts`:

```ts
export { createNotifyWindow } from './notify-window'
```

Update `apps/desktop/src/main/index.ts`:

```ts
import { createNotifyWindows } from './notify-windows'

const notifyWindows = createNotifyWindows()

ipcMain.handle('notify-window:get-state', () => notifyWindows.getState())
```

When showing a notification, the controller already publishes `notify-window:state-changed`; do not add an extra store or TRPC path for it.

- [ ] **Step 6: Re-run the notify-window tests and focused desktop checks**

Run: `pnpm --dir apps/desktop exec vitest run src/main/__tests__/notify-windows.test.ts src/renderer/src/stores/__tests__/notify-window-store.test.ts src/renderer/src/pages/notify/__tests__/notify-window.test.tsx`
Expected: PASS with one-window replacement and route-backed renderer rendering.

Run: `pnpm --filter desktop typecheck`
Expected: PASS. If unrelated historical failures appear, record them separately before continuing.

- [ ] **Step 7: Commit the notify-window path**

```bash
git add apps/desktop/src/shared/notify-window-state.ts apps/desktop/src/main/notify-windows.ts apps/desktop/src/main/windows/notify-window.ts apps/desktop/src/main/windows/index.ts apps/desktop/src/main/__tests__/notify-windows.test.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.d.ts apps/desktop/src/renderer/src/router/index.tsx apps/desktop/src/renderer/src/stores/notify-window-store.ts apps/desktop/src/renderer/src/stores/__tests__/notify-window-store.test.ts apps/desktop/src/renderer/src/pages/notify/notify-window.tsx apps/desktop/src/renderer/src/pages/notify/__tests__/notify-window.test.tsx
git commit -m "feat: add notify window for clipboard fallback"
```

**Final State Notes**

- Task 4 replaced the Task 3 no-op notify callback with `notifyWindows.show(...)` in `index.ts`.
- The final notify-window controller now:
  - recomputes position on every `show(...)`
  - recreates after manual close
  - closes/destroys the window after timeout instead of leaving it hidden
  - resets bridge state to `INITIAL_NOTIFY_WINDOW_BRIDGE_STATE` on close
- The notify renderer page intentionally supports display-only `actions` without callback dispatch in this version.
- Task 4 landed as:
  - `bdd5f4c` initial notify-window implementation
  - `cfeb31b` reposition-on-show and no-actions layout fix
  - `99c1c4a` timeout-close lifecycle fix

## Spec Coverage Check

- Target-app based instruction matching is implemented in Task 1 and used from the pipeline in Task 3.
- Prompt augmentation via matched `customInstructions` is covered in Task 3.
- Delivery-time re-check of the current target app is covered in Task 2 and exercised again in Task 3.
- Clipboard fallback plus notify-window feedback is covered in Task 2 and Task 4.
- Delivery debug persistence is covered in Task 1 and Task 3.

## Placeholder Scan

- No `TODO`, `TBD`, or "similar to" references remain.
- Every code-changing step includes concrete code snippets.
- Every verification step includes an exact command and expected result.

## Type Consistency Check

- `matchedInstruction.autoEnterMode` stays `off | enter | mod-enter` throughout.
- `debug.delivery` always uses `method`, `status`, `autoSendTriggered`, and optional `failureMessage`.
- Notify bridge state always uses `notification`, not `toast`, `message`, or `payload`.

## Post-Plan Follow-Ups

After the four planned tasks were complete, one final integrated follow-up was required to close cross-task gaps that only showed up in whole-branch review.

- `e5a591f`: align instruction ownership keys across normalization, editor transfer logic, and runtime matcher semantics
- `99c1c4a`: close the remaining integration gaps:
  - stable-identity ownership now uses overlapping stable identity sets instead of a single preferred key
  - instructions save failure no longer leaks draft ownership transfer into store-backed page state
  - notify windows now close on timeout and reset bridge state on close

These follow-ups are now part of the authoritative final implementation state for this plan.
