import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AppIdentity } from '@openbroca/app-identity'
import { createFinalTextDeliveryService } from '../final-text-delivery/service'
import { createMacPasteText } from '../final-text-delivery/platform/macos'
import { createWindowsPasteText } from '../final-text-delivery/platform/windows'

const matchedActivationApp: AppIdentity = {
  id: 'com.openai.chat',
  displayName: 'ChatGPT',
  platform: 'macos',
  source: 'detected',
  bundleId: 'com.openai.chat'
}

const frontmostChatGPT: AppIdentity = {
  id: 'frontmost-chatgpt-window',
  displayName: 'ChatGPT',
  platform: 'macos',
  source: 'detected',
  bundleId: 'com.openai.chat'
}

const frontmostFeishu: AppIdentity = {
  id: 'frontmost-feishu-window',
  displayName: 'Feishu',
  platform: 'macos',
  source: 'detected',
  bundleId: 'com.bytedance.feishu'
}

afterEach(() => {
  vi.restoreAllMocks()
})

function createClipboardMocks() {
  return {
    readText: vi.fn(() => 'previous clipboard'),
    writeText: vi.fn(),
    availableFormats: vi.fn(() => ['text/plain', 'text/html']),
    readBuffer: vi.fn((format: string) =>
      format === 'text/plain'
        ? Buffer.from('previous clipboard')
        : Buffer.from('<b>previous clipboard</b>')
    ),
    writeBuffer: vi.fn(),
    clear: vi.fn()
  }
}

function createClipboardMocksWithEvents(events: string[]) {
  return {
    readText: vi.fn(() => 'previous clipboard'),
    writeText: vi.fn(),
    availableFormats: vi.fn(() => ['text/plain', 'text/html']),
    readBuffer: vi.fn((format: string) =>
      format === 'text/plain'
        ? Buffer.from('previous clipboard')
        : Buffer.from('<b>previous clipboard</b>')
    ),
    writeBuffer: vi.fn((format: string) => {
      events.push(`restore:${format}`)
    }),
    clear: vi.fn(() => {
      events.push('restore:start')
    })
  }
}

function createRequest(overrides: Partial<Parameters<ReturnType<typeof createFinalTextDeliveryService>['deliver']>[0]> = {}) {
  return {
    text: 'Send this now.',
    targetAppAtMatch: {
      id: 'matched-chatgpt-window',
      displayName: 'ChatGPT',
      platform: 'macos',
      source: 'detected',
      bundleId: 'com.openai.chat'
    } satisfies AppIdentity,
    matchedInstruction: {
      ruleId: 'rule-chat',
      name: 'Chat',
      autoEnterMode: 'enter' as const,
      customInstructions: 'Use short chat-style replies.',
      activationApp: matchedActivationApp
    },
    instructionPromptApplied: true,
    ...overrides
  }
}

function createExpectedInstruction(autoEnterMode: 'off' | 'enter' | 'mod-enter' = 'enter') {
  return {
    ruleId: 'rule-chat',
    name: 'Chat',
    autoEnterMode
  }
}

describe('createFinalTextDeliveryService', () => {
  test('matched app still matches and paste succeeds with settle wait before clipboard restore and auto-enter', async () => {
    const events: string[] = []
    const clipboard = createClipboardMocksWithEvents(events)
    const pasteText = vi.fn().mockImplementation(async () => {
      events.push('paste')
      return { ok: true as const, method: 'paste' as const }
    })
    const waitAfterPaste = vi.fn().mockImplementation(async () => {
      events.push('wait')
    })
    const triggerAutoEnter = vi.fn().mockImplementation(async () => {
      events.push('auto-enter')
    })
    const notifyClipboardFallback = vi.fn()
    const getTargetApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostChatGPT)

    const service = createFinalTextDeliveryService({
      getTargetApp,
      clipboard,
      pasteText,
      waitAfterPaste,
      triggerAutoEnter,
      notifyClipboardFallback
    })

    await expect(service.deliver(createRequest())).resolves.toEqual({
      targetAppAtMatch: {
        id: 'matched-chatgpt-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: frontmostChatGPT,
      matchedInstruction: createExpectedInstruction(),
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: true,
      method: 'paste',
      status: 'completed',
      outcome: 'paste-success',
      pasteAttempted: true,
      autoSendTriggered: true
    })

    expect(clipboard.writeText).toHaveBeenCalledWith('Send this now.')
    expect(clipboard.availableFormats).toHaveBeenCalledTimes(1)
    expect(clipboard.readBuffer).toHaveBeenCalledWith('text/plain')
    expect(clipboard.readBuffer).toHaveBeenCalledWith('text/html')
    expect(clipboard.clear).toHaveBeenCalledTimes(1)
    expect(clipboard.writeBuffer).toHaveBeenCalledWith('text/plain', Buffer.from('previous clipboard'))
    expect(clipboard.writeBuffer).toHaveBeenCalledWith(
      'text/html',
      Buffer.from('<b>previous clipboard</b>')
    )
    expect(waitAfterPaste).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['paste', 'wait', 'auto-enter', 'restore:start', 'restore:text/plain', 'restore:text/html'])
    expect(triggerAutoEnter).toHaveBeenCalledWith('enter')
    expect(notifyClipboardFallback).not.toHaveBeenCalled()
  })

  test('matched app changed still preserves prompt-applied flag and waits before clipboard restore', async () => {
    const events: string[] = []
    const clipboard = createClipboardMocksWithEvents(events)
    const pasteText = vi.fn().mockImplementation(async () => {
      events.push('paste')
      return { ok: true as const, method: 'paste' as const }
    })
    const waitAfterPaste = vi.fn().mockImplementation(async () => {
      events.push('wait')
    })
    const triggerAutoEnter = vi.fn()
    const notifyClipboardFallback = vi.fn()
    const getTargetApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostFeishu)

    const service = createFinalTextDeliveryService({
      getTargetApp,
      clipboard,
      pasteText,
      waitAfterPaste,
      triggerAutoEnter,
      notifyClipboardFallback
    })

    await expect(service.deliver(createRequest())).resolves.toEqual({
      targetAppAtMatch: {
        id: 'matched-chatgpt-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: frontmostFeishu,
      matchedInstruction: createExpectedInstruction(),
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: false,
      method: 'paste',
      status: 'completed',
      outcome: 'paste-success',
      pasteAttempted: true,
      autoSendTriggered: false
    })

    expect(waitAfterPaste).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['paste', 'wait', 'restore:start', 'restore:text/plain', 'restore:text/html'])
    expect(triggerAutoEnter).not.toHaveBeenCalled()
    expect(notifyClipboardFallback).not.toHaveBeenCalled()
  })

  test('no matched instruction still pastes into the current frontmost app without auto-enter', async () => {
    const clipboard = createClipboardMocks()
    const pasteText = vi.fn().mockResolvedValue({ ok: true as const, method: 'paste' as const })
    const triggerAutoEnter = vi.fn()
    const notifyClipboardFallback = vi.fn()
    const getTargetApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostFeishu)

    const service = createFinalTextDeliveryService({
      getTargetApp,
      clipboard,
      pasteText,
      triggerAutoEnter,
      notifyClipboardFallback
    })

    await expect(
      service.deliver(
        createRequest({
          matchedInstruction: null,
          instructionPromptApplied: false
        })
      )
    ).resolves.toEqual({
      targetAppAtMatch: {
        id: 'matched-chatgpt-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: frontmostFeishu,
      matchedInstruction: null,
      instructionPromptApplied: false,
      ownershipMatchedAtDelivery: false,
      method: 'paste',
      status: 'completed',
      outcome: 'paste-success',
      pasteAttempted: true,
      autoSendTriggered: false
    })

    expect(triggerAutoEnter).not.toHaveBeenCalled()
  })

  test('falls back to clipboard when no current target app is resolved', async () => {
    const clipboard = createClipboardMocks()
    const pasteText = vi.fn()
    const triggerAutoEnter = vi.fn()
    const notifyClipboardFallback = vi.fn()
    const getTargetApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)

    const service = createFinalTextDeliveryService({
      getTargetApp,
      clipboard,
      pasteText,
      triggerAutoEnter,
      notifyClipboardFallback
    })

    await expect(service.deliver(createRequest())).resolves.toEqual({
      targetAppAtMatch: {
        id: 'matched-chatgpt-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: null,
      matchedInstruction: createExpectedInstruction(),
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: false,
      method: 'clipboard',
      status: 'fallback',
      outcome: 'clipboard-fallback',
      pasteAttempted: false,
      autoSendTriggered: false,
      fallbackReason: 'target-not-resolved'
    })

    expect(clipboard.writeText).toHaveBeenCalledWith('Send this now.')
    expect(pasteText).not.toHaveBeenCalled()
    expect(triggerAutoEnter).not.toHaveBeenCalled()
    expect(notifyClipboardFallback).toHaveBeenCalledTimes(1)
  })

  test('clipboard write failure returns delivery-failed', async () => {
    const clipboard = createClipboardMocks()
    clipboard.writeText.mockImplementation(() => {
      throw new Error('clipboard write failed')
    })

    const pasteText = vi.fn()
    const triggerAutoEnter = vi.fn()
    const notifyClipboardFallback = vi.fn()
    const getTargetApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(null)

    const service = createFinalTextDeliveryService({
      getTargetApp,
      clipboard,
      pasteText,
      triggerAutoEnter,
      notifyClipboardFallback
    })

    await expect(service.deliver(createRequest())).resolves.toEqual({
      targetAppAtMatch: {
        id: 'matched-chatgpt-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: null,
      matchedInstruction: createExpectedInstruction(),
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: false,
      method: 'clipboard',
      status: 'failed',
      outcome: 'delivery-failed',
      pasteAttempted: false,
      autoSendTriggered: false,
      fallbackReason: 'clipboard-write-failed',
      failureMessage: 'clipboard write failed'
    })

    expect(pasteText).not.toHaveBeenCalled()
    expect(notifyClipboardFallback).not.toHaveBeenCalled()
  })

  test('paste command failure falls back to clipboard after the clipboard write', async () => {
    const clipboard = createClipboardMocks()
    const pasteText = vi.fn().mockResolvedValue({
      ok: false as const,
      reason: 'command-failed' as const
    })
    const triggerAutoEnter = vi.fn()
    const notifyClipboardFallback = vi.fn()
    const getTargetApp = vi.fn<() => Promise<AppIdentity | null>>().mockResolvedValue(frontmostChatGPT)

    const service = createFinalTextDeliveryService({
      getTargetApp,
      clipboard,
      pasteText,
      triggerAutoEnter,
      notifyClipboardFallback
    })

    await expect(service.deliver(createRequest())).resolves.toEqual({
      targetAppAtMatch: {
        id: 'matched-chatgpt-window',
        displayName: 'ChatGPT',
        platform: 'macos',
        source: 'detected',
        bundleId: 'com.openai.chat'
      },
      targetAppAtDelivery: frontmostChatGPT,
      matchedInstruction: createExpectedInstruction(),
      instructionPromptApplied: true,
      ownershipMatchedAtDelivery: true,
      method: 'clipboard',
      status: 'fallback',
      outcome: 'clipboard-fallback',
      pasteAttempted: true,
      autoSendTriggered: false,
      fallbackReason: 'paste-command-failed'
    })

    expect(clipboard.writeText).toHaveBeenCalledWith('Send this now.')
    expect(triggerAutoEnter).not.toHaveBeenCalled()
    expect(notifyClipboardFallback).toHaveBeenCalledTimes(1)
  })

  test('macOS paste helper sends Command+V via osascript', async () => {
    const execFile = vi.fn(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )

    await expect(createMacPasteText(execFile as never)('hello')).resolves.toEqual({
      ok: true,
      method: 'paste'
    })

    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      expect.any(Function)
    )
  })

  test('Windows paste helper sends Ctrl+V via PowerShell', async () => {
    const execFile = vi.fn(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )

    await expect(createWindowsPasteText(execFile as never)('hello')).resolves.toEqual({
      ok: true,
      method: 'paste'
    })

    expect(execFile).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys("^v")'
      ],
      expect.any(Function)
    )
  })
})
