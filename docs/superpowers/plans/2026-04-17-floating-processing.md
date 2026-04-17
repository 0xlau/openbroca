# Floating Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the desktop floating window visible from shortcut release through ASR/LLM completion, show a `Thinking...` processing shell with cancel support, and only unlock the next shortcut cycle after the current session settles.

**Architecture:** Extend `ListeningSessionManager` so post-recording work becomes part of the same session lifecycle via a new `processing` state and a cancellable processing task handle. Thread a per-run `AbortSignal` through `PostRecordingPipeline`, extract main-process floating-window orchestration into a small controller, and render the processing shell in `FloatListening` with a shared `ShimmeringText` component from `@openbroca/ui`.

**Tech Stack:** Electron, TypeScript, React 19, Zustand, Vitest, Tailwind CSS 4, uiohook-napi

---

## File Structure

### New Files

- `apps/desktop/src/main/floating-session-controller.ts`
  Owns shortcut callbacks plus state-driven floating-window show, hide, and size updates.
- `apps/desktop/src/main/__tests__/floating-session-controller.test.ts`
  Covers the extracted main-process orchestration without booting the full Electron app.
- `packages/ui/src/shimmering-text.css`
  Defines the shared shimmer keyframes and text treatment used by the new processing UI.
- `packages/ui/src/shimmering-text.tsx`
  Exposes the reusable `ShimmeringText` component for desktop renderer surfaces.
- `packages/ui/src/shimmering-text.test.tsx`
  Verifies shared component rendering and export behavior.

### Modified Files

- `apps/desktop/src/shared/listening-session-state.ts`
  Adds `processing` plus helper predicates shared by main and renderer.
- `apps/desktop/src/main/listening-session.ts`
  Keeps the session alive through post-recording completion and exposes `cancelProcessing()`.
- `apps/desktop/src/main/__tests__/listening-session.test.ts`
  Adds lifecycle coverage for processing, cancel, and shortcut gating.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Accepts a process-level abort signal and records user cancellation as a failed history outcome.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Verifies signal threading and cancellation-specific history/debug behavior.
- `apps/desktop/src/main/window-manager.ts`
  Supports size-aware `showFloating()` calls without coupling hide events back into session control.
- `apps/desktop/src/main/__tests__/window-manager.test.ts`
  Covers resize and visibility behavior for the floating window.
- `apps/desktop/src/main/windows/floating-window.ts`
  Exports the listening and processing floating-window sizes.
- `apps/desktop/src/main/index.ts`
  Wires the extracted controller, new IPC cancel handler, and size-aware floating window behavior.
- `apps/desktop/src/preload/index.ts`
  Exposes `cancelProcessing()` on `window.api.listeningSession`.
- `apps/desktop/src/preload/index.d.ts`
  Declares the new renderer bridge method.
- `apps/desktop/src/preload/__tests__/index.test.ts`
  Verifies the new preload cancel bridge.
- `packages/ui/src/index.ts`
  Re-exports `ShimmeringText`.
- `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
  Renders listening vs processing shells and dispatches cancel while processing.
- `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
  Covers `Thinking...`, processing cancel, and waveform gating.

## Task 1: Extend The Listening Session Lifecycle

**Files:**
- Modify: `apps/desktop/src/shared/listening-session-state.ts`
- Modify: `apps/desktop/src/main/listening-session.ts`
- Modify: `apps/desktop/src/main/__tests__/listening-session.test.ts`

- [ ] **Step 1: Add failing lifecycle tests for `processing`, cancel, and busy-session gating**

```ts
test('holds the session in processing until post-recording work settles', async () => {
  const captureSource = new FakeCaptureSource()
  const processing = createDeferred<void>()
  const onRecordingComplete = vi.fn().mockImplementation(async () => {
    await processing.promise
  })
  const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

  captureSource.pushChunk(new Uint8Array([1, 2, 3, 4]))

  manager.start()
  await captureSource.waitForCaptureStart()
  manager.stop()
  captureSource.finish()

  await vi.waitFor(() => {
    expectManagerState(manager, { status: 'processing' })
  })

  manager.start()
  expect(captureSource.capture).toHaveBeenCalledTimes(1)

  processing.resolve()

  await vi.waitFor(() => {
    expectManagerState(manager, { status: 'idle' })
  })
})

test('cancelProcessing aborts the in-flight post-recording task and returns to idle', async () => {
  const captureSource = new FakeCaptureSource()
  const processing = createDeferred<void>()
  const observedSignals: AbortSignal[] = []
  const onRecordingComplete = vi.fn().mockImplementation(async (_recording, signal: AbortSignal) => {
    observedSignals.push(signal)
    await processing.promise
  })
  const manager = new ListeningSessionManager(captureSource, { onRecordingComplete })

  captureSource.pushChunk(new Uint8Array([9, 9]))

  manager.start()
  await captureSource.waitForCaptureStart()
  manager.stop()
  captureSource.finish()

  await vi.waitFor(() => {
    expectManagerState(manager, { status: 'processing' })
  })

  manager.cancelProcessing()

  expect(observedSignals[0]?.aborted).toBe(true)
  expectManagerState(manager, { status: 'idle' })
})
```

- [ ] **Step 2: Run the desktop listening-session tests to confirm the new lifecycle is not implemented yet**

Run: `pnpm --dir apps/desktop test src/main/__tests__/listening-session.test.ts`
Expected: FAIL with type errors for `status: 'processing'` and `Property 'cancelProcessing' does not exist on type 'ListeningSessionManager'`

- [ ] **Step 3: Implement `processing` state, helper predicates, and cancellable post-recording ownership**

```ts
export type ListeningSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening' }
  | { status: 'stopping' }
  | { status: 'processing' }
  | { status: 'error'; message: string }

export function isListeningSessionBusy(state: ListeningSessionState): boolean {
  return (
    state.status === 'starting' ||
    state.status === 'listening' ||
    state.status === 'stopping' ||
    state.status === 'processing'
  )
}

export function isProcessingShellState(state: ListeningSessionState): boolean {
  return state.status === 'stopping' || state.status === 'processing'
}

export function isTargetAppPollingState(state: ListeningSessionState): boolean {
  return isListeningSessionBusy(state)
}
```

```ts
interface ListeningSessionOptions {
  onRecordingComplete?: (recording: CapturedRecording, signal: AbortSignal) => Promise<void> | void
  getFrontmostAppSnapshot?: () => Promise<AppIdentity | null>
  getTargetApp?: () => Promise<AppIdentity | null>
  targetAppPollIntervalMs?: number
}

interface ProcessingRun {
  controller: AbortController
  generation: number
}

class ListeningSessionManager {
  private abortController: AbortController | null = null
  private processingRun: ProcessingRun | null = null
  private processingGeneration = 0

  start(options?: SessionOptions): void {
    if (isListeningSessionBusy(this.state)) {
      return
    }

    this.abortController = new AbortController()
    this.setSessionState({ status: 'starting' })
    void this.run({ ...options, signal: this.abortController.signal })
  }

  stop(): void {
    if (this.state.status === 'idle' || this.state.status === 'processing' || this.state.status === 'stopping') {
      return
    }

    if (this.state.status === 'error') {
      this.abortController?.abort()
      this.abortController = null
      this.setSessionState({ status: 'idle' })
      return
    }

    this.setSessionState({ status: 'stopping' })
    this.abortController?.abort()
  }

  cancelProcessing(): void {
    if (this.state.status !== 'processing' || !this.processingRun) {
      return
    }

    const run = this.processingRun
    this.processingRun = null
    run.controller.abort()
    this.setSessionState({ status: 'idle' })
  }

  private async run(opts: SessionOptions & { signal: AbortSignal }): Promise<void> {
    const captureOptions: CaptureOptions = {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      signal: opts.signal
    }
    if (opts.deviceId != null) {
      captureOptions.deviceId = opts.deviceId
    }

    format = this.captureSource.resolveFormat(captureOptions)
    const stream = this.captureSource.capture(captureOptions)
    this.setSessionState({ status: 'listening' })

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    if (chunks.length === 0) {
      this.setSessionState({ status: 'idle' })
      return
    }

    const processingController = new AbortController()
    const generation = ++this.processingGeneration
    this.processingRun = { controller: processingController, generation }
    this.setSessionState({ status: 'processing' })

    try {
      await this.options.onRecordingComplete?.(
        {
          format,
          chunks,
          startedAt,
          endedAt,
          durationMs,
          frontmostAppSnapshot
        },
        processingController.signal
      )
    } catch (completionError) {
      console.error('[listening-session] recording completion failed', completionError)
    } finally {
      if (this.processingRun?.generation === generation) {
        this.processingRun = null
        this.setSessionState({ status: 'idle' })
      }
    }
  }
}
```

- [ ] **Step 4: Run the lifecycle tests again and confirm the new state machine passes**

Run: `pnpm --dir apps/desktop test src/main/__tests__/listening-session.test.ts`
Expected: PASS, including the new `processing` and `cancelProcessing()` cases

- [ ] **Step 5: Commit the lifecycle changes**

```bash
git add \
  apps/desktop/src/shared/listening-session-state.ts \
  apps/desktop/src/main/listening-session.ts \
  apps/desktop/src/main/__tests__/listening-session.test.ts
git commit -m "feat: keep listening sessions alive through processing"
```

## Task 2: Thread Abort Through The Post-Recording Pipeline

**Files:**
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Add failing pipeline tests for user-cancelled ASR and LLM work**

```ts
test('passes the process signal to ASR and records user cancellation as a failed attempt', async () => {
  const repository = {
    create: vi.fn(() => ({ id: 'record-cancel-asr' })),
    update: vi.fn()
  }
  const storage = {
    save: vi.fn().mockResolvedValue({
      audioFilePath: '/recordings/cancel-asr.wav',
      fileName: 'cancel-asr.wav',
      byteLength: 32
    })
  }
  const controller = new AbortController()
  const recognize = vi.fn().mockImplementation(async (_input, options?: { signal?: AbortSignal }) => {
    expect(options?.signal).toBe(controller.signal)
    controller.abort()
    throw new DOMException('The operation was aborted.', 'AbortError')
  })

  const pipeline = new PostRecordingPipeline({
    historyRepository: repository as never,
    recordingStorage: storage as never,
    resolveActiveASRSelection: vi.fn().mockResolvedValue({
      provider: { id: 'deepgram', displayName: 'Deepgram', isConfigured: () => true, recognize },
      settings: { language: 'en' }
    }),
    resolveActiveLLMSelection: vi.fn()
  } as never)

  await pipeline.process(
    {
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-17T08:00:00.000Z',
      endedAt: '2026-04-17T08:00:01.000Z',
      durationMs: 1000
    },
    { signal: controller.signal }
  )

  expect(repository.update).toHaveBeenLastCalledWith(
    'record-cancel-asr',
    expect.objectContaining({
      status: 'failed',
      failureStage: 'asr',
      failureMessage: 'Cancelled by user'
    })
  )
})

test('passes the process signal to LLM and records user cancellation in debug timeline', async () => {
  const repository = {
    create: vi.fn(() => ({ id: 'record-cancel-llm' })),
    update: vi.fn()
  }
  const storage = {
    save: vi.fn().mockResolvedValue({
      audioFilePath: '/recordings/cancel-llm.wav',
      fileName: 'cancel-llm.wav',
      byteLength: 32
    })
  }
  const controller = new AbortController()
  const llmProvider = {
    id: 'openai-codex',
    displayName: 'OpenAI Codex',
    isConfigured: () => true,
    listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
    generate: vi.fn().mockImplementation(async (request: CompletionRequest) => {
      expect(request.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
  }

  const pipeline = new PostRecordingPipeline({
    historyRepository: repository as never,
    recordingStorage: storage as never,
    resolveActiveASRSelection: vi.fn().mockResolvedValue({
      provider: {
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize: vi.fn().mockResolvedValue({
          text: 'hello world',
          segments: [{ text: 'hello world', isFinal: true }]
        })
      },
      settings: { language: 'en' }
    }),
    resolveActiveLLMSelection: vi.fn().mockResolvedValue({
      provider: llmProvider,
      model: 'gpt-5.2-codex'
    })
  } as never)

  await pipeline.process(
    {
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([3, 4])],
      startedAt: '2026-04-17T08:00:00.000Z',
      endedAt: '2026-04-17T08:00:01.000Z',
      durationMs: 1000
    },
    { signal: controller.signal }
  )

  expect(repository.update).toHaveBeenLastCalledWith(
    'record-cancel-llm',
    expect.objectContaining({
      status: 'failed',
      failureStage: 'llm',
      failureMessage: 'Cancelled by user',
      debug: expect.objectContaining({
        timeline: expect.arrayContaining([
          expect.objectContaining({
            stage: 'llm',
            status: 'failed',
            message: 'Cancelled by user'
          })
        ])
      })
    })
  )
})
```

- [ ] **Step 2: Run the pipeline tests to confirm the abort path is missing**

Run: `pnpm --dir apps/desktop test src/main/__tests__/post-recording-pipeline.test.ts`
Expected: FAIL because `process()` does not accept a second argument and provider calls never receive the supplied `AbortSignal`

- [ ] **Step 3: Implement process-level abort support and explicit cancellation history handling**

```ts
interface ProcessOptions {
  signal?: AbortSignal
}

function isAbortLikeError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true
  }

  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /abort|cancel/i.test(error.message))
  )
}

function cancellationMessage(): string {
  return 'Cancelled by user'
}

export class PostRecordingPipeline {
  async process(recording: CapturedRecording, options: ProcessOptions = {}): Promise<void> {
    const savedLanguage =
      typeof asrSettings.language === 'string' && asrSettings.language.trim().length > 0
        ? asrSettings.language
        : 'en'
    const asrRequestDebug = { language: savedLanguage }

    const finalizeFailure = (
      stage: 'storage' | 'asr' | 'llm',
      message: string
    ) => {
      errors.push({ stage, message, at: now() })
      pushTimeline(stage, 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: stage,
        failureMessage: message,
        debug: {
          rawTranscriptionText,
          asrSegments,
          asrRequest: asrRequestDebug,
          asrResponseSummary: { segmentCount: asrSegments.length },
          llmRequest: buildLLMRequestDebug(),
          errors: [...errors],
          timeline: [...timeline]
        }
      })
    }

    const asrRecognizeOptions = {
      ...asrRequestDebug,
      signal: options.signal
    }

    const asrResult = await asrProvider.recognize(recognitionInput, asrRecognizeOptions)

    llmRequest = {
      model: llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawTranscriptionText }
      ],
      signal: options.signal
    }

    try {
      const result = await llmProvider.generate(llmRequest)
      this.deps.historyRepository.update(record.id, {
        status: 'completed',
        finalText: result.content,
        debug: {
          llmRequest: buildLLMRequestDebug(),
          llmResponseSummary: {
            finishReason: result.finishReason,
            matchedInstruction: matchedInstructionDebug
          },
          tokenUsage: result.usage,
          timeline: [...timeline]
        }
      })
    } catch (error) {
      if (isAbortLikeError(error, options.signal)) {
        finalizeFailure('llm', cancellationMessage())
        return
      }

      throw error
    }
  }
}
```

- [ ] **Step 4: Re-run the pipeline tests and confirm cancellation is persisted correctly**

Run: `pnpm --dir apps/desktop test src/main/__tests__/post-recording-pipeline.test.ts`
Expected: PASS, with the new cancellation-specific assertions succeeding

- [ ] **Step 5: Commit the pipeline changes**

```bash
git add \
  apps/desktop/src/main/post-recording-pipeline.ts \
  apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
git commit -m "feat: make post-recording pipeline cancellable"
```

## Task 3: Extract Main-Process Floating Window Orchestration

**Files:**
- Create: `apps/desktop/src/main/floating-session-controller.ts`
- Create: `apps/desktop/src/main/__tests__/floating-session-controller.test.ts`
- Modify: `apps/desktop/src/main/window-manager.ts`
- Modify: `apps/desktop/src/main/__tests__/window-manager.test.ts`
- Modify: `apps/desktop/src/main/windows/floating-window.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Add failing orchestration tests for size-aware floating shell behavior and preload cancel IPC**

```ts
import { describe, expect, test, vi } from 'vitest'
import type { ListeningSessionBridgeState } from '../../shared/listening-session-state'
import {
  bindFloatingSessionController,
  FLOATING_LISTENING_SIZE,
  FLOATING_PROCESSING_SIZE
} from '../floating-session-controller'

function createBridge(status: ListeningSessionBridgeState['state']['status']): ListeningSessionBridgeState {
  return { state: status === 'error' ? { status, message: 'boom' } : { status }, targetApp: null }
}

test('switches the floating window to the processing shell on keyup and hides on idle', () => {
  const listeners = new Set<(state: ListeningSessionBridgeState) => void>()
  const listeningSession = {
    getState: vi.fn(() => createBridge('idle')),
    subscribe: vi.fn((listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    start: vi.fn(),
    stop: vi.fn(),
    cancelProcessing: vi.fn()
  }
  const windowManager = {
    showFloating: vi.fn(),
    hideFloating: vi.fn()
  }
  const shortcutManager = {
    start: vi.fn((_accelerator, onDown, onUp) => {
      ;(shortcutManager as never).onDown = onDown
      ;(shortcutManager as never).onUp = onUp
    })
  }

  bindFloatingSessionController({
    listeningSession: listeningSession as never,
    windowManager: windowManager as never,
    shortcutManager: shortcutManager as never,
    accelerator: 'CommandOrControl+Space',
    getSelectedDeviceId: () => 7
  })

  ;(shortcutManager as never).onDown()
  expect(windowManager.showFloating).toHaveBeenCalledWith(FLOATING_LISTENING_SIZE)
  expect(listeningSession.start).toHaveBeenCalledWith({ deviceId: 7 })

  ;(shortcutManager as never).onUp()
  expect(listeningSession.stop).toHaveBeenCalledTimes(1)

  for (const listener of listeners) {
    listener(createBridge('stopping'))
  }

  expect(windowManager.showFloating).toHaveBeenLastCalledWith(FLOATING_PROCESSING_SIZE)

  for (const listener of listeners) {
    listener(createBridge('idle'))
  }

  expect(windowManager.hideFloating).toHaveBeenCalledTimes(1)
})
```

```ts
test('exposes cancelProcessing through the preload bridge', async () => {
  enableContextIsolation()
  await import('../index')

  const api = getExposedApi()
  await api.listeningSession.cancelProcessing()

  expect(invoke).toHaveBeenCalledWith('listening-session:cancel-processing')
})
```

- [ ] **Step 2: Run the controller, window-manager, and preload tests to confirm the new wiring does not exist**

Run: `pnpm --dir apps/desktop test src/main/__tests__/floating-session-controller.test.ts src/main/__tests__/window-manager.test.ts src/preload/__tests__/index.test.ts`
Expected: FAIL with missing-module errors for `floating-session-controller.ts`, missing `cancelProcessing()`, and `showFloating()` not accepting size updates

- [ ] **Step 3: Implement the extracted controller, size-aware `showFloating()`, and cancel IPC wiring**

```ts
export const FLOATING_LISTENING_SIZE = { width: 180, height: 38 }
export const FLOATING_PROCESSING_SIZE = { width: 360, height: 38 }

function wantsProcessingShell(state: ListeningSessionBridgeState['state']): boolean {
  return state.status === 'stopping' || state.status === 'processing'
}

export function bindFloatingSessionController({
  listeningSession,
  windowManager,
  shortcutManager,
  accelerator,
  getSelectedDeviceId
}: {
  listeningSession: Pick<ListeningSessionManager, 'getState' | 'subscribe' | 'start' | 'stop'>
  windowManager: Pick<WindowManager, 'showFloating' | 'hideFloating'>
  shortcutManager: Pick<ShortcutManager, 'start'>
  accelerator: string
  getSelectedDeviceId: () => number | undefined
}) {
  listeningSession.subscribe((bridge) => {
    if (bridge.state.status === 'idle' || bridge.state.status === 'error') {
      windowManager.hideFloating()
      return
    }

    windowManager.showFloating(
      wantsProcessingShell(bridge.state) ? FLOATING_PROCESSING_SIZE : FLOATING_LISTENING_SIZE
    )
  })

  shortcutManager.start(
    accelerator,
    () => {
      if (listeningSession.getState().state.status !== 'idle') {
        return
      }

      windowManager.showFloating(FLOATING_LISTENING_SIZE)
      listeningSession.start({ deviceId: getSelectedDeviceId() })
    },
    () => {
      const status = listeningSession.getState().state.status
      if (status === 'starting' || status === 'listening') {
        listeningSession.stop()
      }
    }
  )
}
```

```ts
showFloating(size?: Pick<Rectangle, 'width' | 'height'>): void {
  if (!this.floatingWindow || this.floatingWindow.isDestroyed()) {
    this.floatingWindow = this.createFloatingWindow()
    this.floatingWindow.on?.('closed', () => {
      this.floatingWindow = null
    })
  }

  const currentBounds = this.floatingWindow.getBounds()
  const nextBounds = {
    ...currentBounds,
    width: size?.width ?? currentBounds.width,
    height: size?.height ?? currentBounds.height
  }
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y } = getFloatingWindowPosition(display.workArea, nextBounds)

  this.floatingWindow.setBounds({ ...nextBounds, x, y })

  if (!this.floatingWindow.isVisible()) {
    this.floatingWindow.showInactive()
  }
}
```

```ts
ipcMain.handle('listening-session:cancel-processing', () => listeningSession.cancelProcessing())

bindFloatingSessionController({
  listeningSession,
  windowManager,
  shortcutManager,
  accelerator: getAccelerator(),
  getSelectedDeviceId: () => {
    const microphone = store.get('microphone') as { selectedDeviceId?: number | null } | undefined
    return microphone?.selectedDeviceId ?? undefined
  }
})
```

```ts
listeningSession: {
  getState: () =>
    ipcRenderer.invoke('listening-session:get-state') as Promise<ListeningSessionBridgeState>,
  cancelProcessing: () => ipcRenderer.invoke('listening-session:cancel-processing') as Promise<void>,
  onStateChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: ListeningSessionBridgeState) =>
      callback(state)

    ipcRenderer.on('listening-session:state-changed', handler)
    return () => ipcRenderer.removeListener('listening-session:state-changed', handler)
  }
}
```

- [ ] **Step 4: Re-run the focused main-process and preload tests**

Run: `pnpm --dir apps/desktop test src/main/__tests__/floating-session-controller.test.ts src/main/__tests__/window-manager.test.ts src/preload/__tests__/index.test.ts`
Expected: PASS, including the new size-aware shell transition and preload cancel bridge coverage

- [ ] **Step 5: Commit the orchestration changes**

```bash
git add \
  apps/desktop/src/main/floating-session-controller.ts \
  apps/desktop/src/main/__tests__/floating-session-controller.test.ts \
  apps/desktop/src/main/window-manager.ts \
  apps/desktop/src/main/__tests__/window-manager.test.ts \
  apps/desktop/src/main/windows/floating-window.ts \
  apps/desktop/src/main/index.ts \
  apps/desktop/src/preload/index.ts \
  apps/desktop/src/preload/index.d.ts \
  apps/desktop/src/preload/__tests__/index.test.ts
git commit -m "feat: orchestrate floating window from session state"
```

## Task 4: Add The Shared `ShimmeringText` UI Primitive

**Files:**
- Create: `packages/ui/src/shimmering-text.css`
- Create: `packages/ui/src/shimmering-text.tsx`
- Create: `packages/ui/src/shimmering-text.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Add a failing shared-component test**

```ts
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ShimmeringText } from './shimmering-text'

describe('ShimmeringText', () => {
  test('renders text content and merges caller classes', () => {
    render(<ShimmeringText className="text-sm">Thinking...</ShimmeringText>)

    const text = screen.getByText('Thinking...')

    expect(text).toBeTruthy()
    expect(text.className).toContain('text-sm')
    expect(text.className).toContain('openbroca-shimmering-text')
  })
})
```

- [ ] **Step 2: Run the UI-package test to confirm the shared component does not exist**

Run: `pnpm vitest run packages/ui/src/shimmering-text.test.tsx`
Expected: FAIL with `Cannot find module './shimmering-text'`

- [ ] **Step 3: Implement the shared CSS-backed shimmer component and export it**

```css
@keyframes openbroca-text-shimmer {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: -100% 50%;
  }
}

.openbroca-shimmering-text {
  background-image: linear-gradient(
    110deg,
    oklch(0.78 0.03 255) 20%,
    oklch(0.98 0.01 255) 38%,
    oklch(0.78 0.03 255) 56%
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: openbroca-text-shimmer 2.2s linear infinite;
}
```

```tsx
import * as React from 'react'
import './shimmering-text.css'
import { cn } from './utils'

function ShimmeringText({
  className,
  children,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="shimmering-text"
      className={cn('openbroca-shimmering-text inline-block font-medium tracking-[0.02em]', className)}
      {...props}
    >
      {children}
    </span>
  )
}

export { ShimmeringText }
```

```ts
export * from './shimmering-text'
```

- [ ] **Step 4: Run the shared UI test and package typecheck**

Run: `pnpm vitest run packages/ui/src/shimmering-text.test.tsx && pnpm --filter @openbroca/ui typecheck`
Expected: PASS for both the unit test and the package-local typecheck

- [ ] **Step 5: Commit the shared UI primitive**

```bash
git add \
  packages/ui/src/shimmering-text.css \
  packages/ui/src/shimmering-text.tsx \
  packages/ui/src/shimmering-text.test.tsx \
  packages/ui/src/index.ts
git commit -m "feat: add shared shimmering text component"
```

## Task 5: Render The Processing Shell In `FloatListening`

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/float/float-listening.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx`

- [ ] **Step 1: Add failing renderer tests for `Thinking...` and processing cancel**

```ts
async function renderForBridgeState(
  bridge: ListeningSessionBridgeState,
  overrides: {
    cancelProcessing?: ReturnType<typeof vi.fn>
  } = {}
) {
  const listeners = new Set<(next: ListeningSessionBridgeState) => void>()
  window.api = {
    ...window.api,
    windowControls: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn()
    },
    listeningSession: {
      getState: vi.fn().mockResolvedValue(bridge),
      cancelProcessing: overrides.cancelProcessing ?? vi.fn().mockResolvedValue(undefined),
      onStateChange: vi.fn((callback) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
      })
    }
  }

  const { FloatListening } = await import('../float-listening')
  const view = render(<FloatListening />)

  await waitFor(() => {
    expect(within(view.container).queryByTestId('waveform')).not.toBeNull()
  })

  return {
    container: view.container,
    emit(next: ListeningSessionBridgeState) {
      for (const listener of listeners) {
        listener(next)
      }
    }
  }
}

test('renders the processing shell for stopping and processing states', async () => {
  const { container, emit } = await renderForBridgeState({
    state: { status: 'stopping' },
    targetApp: null
  })

  await waitFor(() => {
    expect(within(container).getByText('Thinking...')).toBeTruthy()
    expect(within(container).queryByTestId('waveform')).toBeNull()
    expect(within(container).getByRole('button')).toBeTruthy()
  })

  emit({
    state: { status: 'processing' },
    targetApp: null
  })

  await waitFor(() => {
    expect(within(container).getByText('Thinking...')).toBeTruthy()
  })
})

test('clicking cancel while processing invokes the preload bridge', async () => {
  const cancelProcessing = vi.fn().mockResolvedValue(undefined)
  const { container } = await renderForBridgeState(
    {
      state: { status: 'processing' },
      targetApp: null
    },
    { cancelProcessing }
  )

  const button = within(container).getByRole('button')
  button.click()

  await waitFor(() => {
    expect(cancelProcessing).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the float-listening renderer tests to confirm the processing shell is missing**

Run: `pnpm --dir apps/desktop test src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: FAIL because `Thinking...` is never rendered and the page does not call `window.api.listeningSession.cancelProcessing()`

- [ ] **Step 3: Implement the processing layout, shared shimmer usage, and cancel click**

```tsx
import React, { useEffect } from 'react'
import { Button, LiveWaveform, ShimmeringText } from '@openbroca/ui'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@openbroca/ui'
import { useStore } from 'zustand'
import { listeningSessionStore } from '@renderer/stores/listening-session-store'
import { microphoneStore } from '@renderer/stores/microphone-store'

export const FloatListening: React.FC = () => {
  useEffect(() => {
    document.body.classList.add('float-listening')
    return () => document.body.classList.remove('float-listening')
  }, [])

  const { data } = useStore(microphoneStore)
  const { bridge } = useStore(listeningSessionStore)
  const { state, targetApp } = bridge
  const showProcessing = state.status === 'stopping' || state.status === 'processing'
  const showCancel = state.status === 'processing'

  return (
    <div className="flex gap-2">
      <div
        className={cn(
          'bg-background h-9 shrink-0 flex items-center rounded-full border gap-2',
          showProcessing ? 'w-[320px] px-3 justify-between' : targetApp?.iconDataUrl ? 'px-2 pr-3' : 'px-4'
        )}
      >
        {!showProcessing && targetApp?.iconDataUrl ? (
          <div
            className="size-6 shrink-0 overflow-hidden rounded-full"
            data-testid="float-target-app-icon"
          >
            <img
              src={targetApp.iconDataUrl}
              alt={`${targetApp.displayName} icon`}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        {showProcessing ? (
          <div className="flex min-w-0 items-center gap-3">
            <ShimmeringText className="text-sm">Thinking...</ShimmeringText>
          </div>
        ) : (
          <LiveWaveform
            active={state.status === 'listening'}
            deviceId={data.selectedBrowserDeviceId ?? undefined}
            mode="static"
            barColor="oklch(0.646 0.222 41.116)"
            barWidth={2}
            barRadius={999}
            barGap={2}
            barHeight={1}
            height={32}
            className="w-12"
          />
        )}
      </div>

      {showCancel ? (
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void window.api.listeningSession.cancelProcessing()}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Re-run the float-listening tests**

Run: `pnpm --dir apps/desktop test src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: PASS, including the new `Thinking...` and processing-cancel cases

- [ ] **Step 5: Commit the float renderer changes**

```bash
git add \
  apps/desktop/src/renderer/src/pages/float/float-listening.tsx \
  apps/desktop/src/renderer/src/pages/float/__tests__/float-listening.test.tsx
git commit -m "feat: show processing shell in floating listening window"
```

## Task 6: Run Final Focused Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the focused desktop and UI verification suite**

Run: `pnpm vitest run packages/ui/src/shimmering-text.test.tsx && pnpm --filter @openbroca/ui typecheck && pnpm --dir apps/desktop test src/main/__tests__/listening-session.test.ts src/main/__tests__/post-recording-pipeline.test.ts src/main/__tests__/floating-session-controller.test.ts src/main/__tests__/window-manager.test.ts src/preload/__tests__/index.test.ts src/renderer/src/pages/float/__tests__/float-listening.test.tsx`
Expected: PASS across the shared UI, main-process, preload, and float renderer coverage introduced by this feature

- [ ] **Step 2: Record the verification result and stop when every command passes**

```text
Verification complete:
- shared shimmer component: pass
- @openbroca/ui typecheck: pass
- desktop listening-session tests: pass
- desktop post-recording-pipeline tests: pass
- desktop floating-session-controller tests: pass
- desktop window-manager tests: pass
- desktop preload bridge tests: pass
- desktop float-listening renderer tests: pass
```

## Self-Review

### Spec Coverage

- `processing` as a first-class state is covered by Task 1.
- signal threading plus failed-history cancellation retention is covered by Task 2.
- shortcut gating, window visibility, width `360`, and preload cancel bridge are covered by Task 3.
- shared shimmer component in `packages/ui/src` is covered by Task 4.
- `FloatListening` processing shell, `Thinking...`, and cancel button behavior are covered by Task 5.
- focused regression and integration verification are covered by Task 6.

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation notes remain.
- Every task includes exact file paths, test commands, and concrete code snippets.

### Type Consistency

- Shared lifecycle names remain consistent across tasks: `processing`, `cancelProcessing()`, `ShimmeringText`, `bindFloatingSessionController`, `FLOATING_LISTENING_SIZE`, and `FLOATING_PROCESSING_SIZE`.
- The same abort entrypoint is used consistently across main, preload, and renderer: `window.api.listeningSession.cancelProcessing()`.
