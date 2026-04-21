import { clipboard as electronClipboard } from 'electron'
import type { AppIdentity } from '@openbroca/app-identity'
import type { ActionableAutoEnterMode } from '../send-key/auto-enter'

type ClipboardPasteAttemptResult =
  | { ok: true; method: 'paste' }
  | { ok: false; reason: 'command-failed' | 'not-available' }

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
  instructionPromptApplied: boolean
}

type DeliveryResult = {
  targetAppAtMatch: AppIdentity | null
  targetAppAtDelivery: AppIdentity | null
  matchedInstruction: Omit<DeliveryInstruction, 'customInstructions' | 'activationApp'> | null
  instructionPromptApplied: boolean
  ownershipMatchedAtDelivery: boolean
  method: 'pending' | 'paste' | 'clipboard'
  status: 'pending' | 'completed' | 'fallback' | 'failed'
  outcome: 'pending' | 'paste-success' | 'clipboard-fallback' | 'delivery-failed'
  pasteAttempted: boolean
  autoSendTriggered: boolean
  failureMessage?: string
  fallbackReason?: 'target-not-resolved' | 'paste-command-failed' | 'clipboard-write-failed'
}

type ClipboardSnapshotEntry = {
  format: string
  data: Buffer
}

interface ClipboardAccess {
  readText: () => string
  writeText: (text: string) => void
  availableFormats: () => string[]
  readBuffer: (format: string) => Buffer
  writeBuffer: (format: string, data: Buffer) => void
  clear: () => void
}

export interface FinalTextDeliveryService {
  deliver: (request: DeliveryRequest) => Promise<DeliveryResult>
}

interface CreateFinalTextDeliveryServiceDeps {
  getTargetApp: () => Promise<AppIdentity | null>
  clipboard?: ClipboardAccess
  pasteText: (text: string) => Promise<ClipboardPasteAttemptResult>
  waitAfterPaste?: () => Promise<void>
  triggerAutoEnter: (mode: ActionableAutoEnterMode) => Promise<void>
  notifyClipboardFallback: (result: DeliveryResult) => Promise<void> | void
}

const DEFAULT_POST_PASTE_SETTLE_MS = 80

function sameApp(left: AppIdentity, right: AppIdentity): boolean {
  if (left.id === right.id) {
    return true
  }

  if (left.bundleId && right.bundleId && left.bundleId === right.bundleId) {
    return true
  }

  if (left.aumid && right.aumid && left.aumid === right.aumid) {
    return true
  }

  if (left.path && right.path && left.path === right.path) {
    return true
  }

  return false
}

function sanitizeInstruction(
  instruction: DeliveryInstruction | null
): DeliveryResult['matchedInstruction'] {
  if (!instruction) {
    return null
  }

  return {
    ruleId: instruction.ruleId,
    name: instruction.name,
    autoEnterMode: instruction.autoEnterMode
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Final text delivery failed'
}

function combineFailureMessages(...messages: Array<string | undefined>): string | undefined {
  const normalized = messages.filter((message): message is string => Boolean(message && message.length > 0))
  if (normalized.length === 0) {
    return undefined
  }

  return [...new Set(normalized)].join('; ')
}

function snapshotClipboardPayload(clipboard: ClipboardAccess): ClipboardSnapshotEntry[] {
  return clipboard.availableFormats().map((format) => ({
    format,
    data: clipboard.readBuffer(format)
  }))
}

function restoreClipboardPayload(
  clipboard: ClipboardAccess,
  snapshot: ClipboardSnapshotEntry[]
): string | undefined {
  try {
    clipboard.clear()

    for (const entry of snapshot) {
      clipboard.writeBuffer(entry.format, entry.data)
    }

    return undefined
  } catch (error) {
    return normalizeErrorMessage(error)
  }
}

function createPendingResult(input: {
  request: DeliveryRequest
  matchedInstruction: DeliveryResult['matchedInstruction']
  targetAppAtDelivery: AppIdentity | null
  ownershipMatchedAtDelivery: boolean
}): DeliveryResult {
  return {
    targetAppAtMatch: input.request.targetAppAtMatch ?? null,
    targetAppAtDelivery: input.targetAppAtDelivery,
    matchedInstruction: input.matchedInstruction,
    instructionPromptApplied: input.request.instructionPromptApplied,
    ownershipMatchedAtDelivery: input.ownershipMatchedAtDelivery,
    method: 'pending',
    status: 'pending',
    outcome: 'pending',
    pasteAttempted: false,
    autoSendTriggered: false
  }
}

async function completeClipboardFallback(
  clipboard: ClipboardAccess,
  notifyClipboardFallback: (result: DeliveryResult) => Promise<void> | void,
  result: DeliveryResult,
  text: string,
  failureMessage?: string
): Promise<DeliveryResult> {
  const fallbackResult: DeliveryResult = {
    ...result,
    method: 'clipboard',
    status: 'fallback',
    outcome: 'clipboard-fallback',
    autoSendTriggered: false
  }

  let clipboardFailureMessage: string | undefined
  let notifyFailureMessage: string | undefined

  try {
    clipboard.writeText(text)
  } catch (error) {
    clipboardFailureMessage = normalizeErrorMessage(error)
  }

  if (!clipboardFailureMessage) {
    try {
      await notifyClipboardFallback(fallbackResult)
    } catch (error) {
      notifyFailureMessage = normalizeErrorMessage(error)
    }
  }

  const combinedFailureMessage = combineFailureMessages(
    fallbackResult.failureMessage,
    failureMessage,
    clipboardFailureMessage,
    notifyFailureMessage
  )

  if (clipboardFailureMessage) {
    return {
      ...fallbackResult,
      status: 'failed',
      outcome: 'delivery-failed',
      fallbackReason: 'clipboard-write-failed',
      failureMessage: combinedFailureMessage
    }
  }

  if (combinedFailureMessage) {
    return {
      ...fallbackResult,
      failureMessage: combinedFailureMessage
    }
  }

  return fallbackResult
}
async function attemptPaste(
  pasteText: (text: string) => Promise<ClipboardPasteAttemptResult>,
  text: string
): Promise<{ attempt: ClipboardPasteAttemptResult; failureMessage?: string }> {
  try {
    return {
      attempt: await pasteText(text)
    }
  } catch (error) {
    return {
      attempt: {
        ok: false,
        reason: 'command-failed'
      },
      failureMessage: normalizeErrorMessage(error)
    }
  }
}

async function waitForPostPasteSettle(
  waitAfterPaste: () => Promise<void>
): Promise<string | undefined> {
  try {
    await waitAfterPaste()
    return undefined
  } catch (error) {
    return normalizeErrorMessage(error)
  }
}

export function createFinalTextDeliveryService(
  deps: CreateFinalTextDeliveryServiceDeps
): FinalTextDeliveryService {
  const clipboard: ClipboardAccess = deps.clipboard ?? {
    readText: () => electronClipboard.readText(),
    writeText: (text) => electronClipboard.writeText(text),
    availableFormats: () => electronClipboard.availableFormats(),
    readBuffer: (format) => electronClipboard.readBuffer(format),
    writeBuffer: (format, data) => electronClipboard.writeBuffer(format, data),
    clear: () => electronClipboard.clear()
  }
  const waitAfterPaste =
    deps.waitAfterPaste ??
    (() =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, DEFAULT_POST_PASTE_SETTLE_MS)
      }))

  return {
    async deliver(request) {
      const matchedInstruction = sanitizeInstruction(request.matchedInstruction)
      let targetAppAtDelivery: AppIdentity | null = null

      try {
        targetAppAtDelivery = (await deps.getTargetApp()) ?? null
      } catch (error) {
        return completeClipboardFallback(
          clipboard,
          deps.notifyClipboardFallback,
          {
            ...createPendingResult({
              request,
              matchedInstruction,
              targetAppAtDelivery: null,
              ownershipMatchedAtDelivery: false
            }),
            fallbackReason: 'target-not-resolved'
          },
          request.text,
          normalizeErrorMessage(error)
        )
      }

      const ownershipMatchedAtDelivery = Boolean(
        request.matchedInstruction &&
          targetAppAtDelivery &&
          sameApp(request.matchedInstruction.activationApp, targetAppAtDelivery)
      )

      const baseResult = createPendingResult({
        request,
        matchedInstruction,
        targetAppAtDelivery,
        ownershipMatchedAtDelivery
      })

      if (!targetAppAtDelivery) {
        return completeClipboardFallback(
          clipboard,
          deps.notifyClipboardFallback,
          {
            ...baseResult,
            fallbackReason: 'target-not-resolved'
          },
          request.text
        )
      }

      let clipboardSnapshot: ClipboardSnapshotEntry[] | null = null
      try {
        clipboardSnapshot = snapshotClipboardPayload(clipboard)
        clipboard.writeText(request.text)
      } catch (error) {
        const restoreFailureMessage = clipboardSnapshot
          ? restoreClipboardPayload(clipboard, clipboardSnapshot)
          : undefined

        return {
          ...baseResult,
          method: 'clipboard',
          status: 'failed',
          outcome: 'delivery-failed',
          failureMessage: combineFailureMessages(normalizeErrorMessage(error), restoreFailureMessage),
          fallbackReason: 'clipboard-write-failed'
        }
      }

      const pasteExecution = await attemptPaste(deps.pasteText, request.text)
      const attempt = pasteExecution.attempt

      if (!attempt.ok) {
        return completeClipboardFallback(
          clipboard,
          deps.notifyClipboardFallback,
          {
            ...baseResult,
            pasteAttempted: true,
            fallbackReason: 'paste-command-failed'
          },
          request.text,
          pasteExecution.failureMessage
        )
      }

      const successResult: DeliveryResult = {
        ...baseResult,
        method: attempt.method,
        status: 'completed',
        outcome: 'paste-success',
        pasteAttempted: true
      }
      const waitFailureMessage = await waitForPostPasteSettle(waitAfterPaste)

      const restoreClipboardIfNeeded = () =>
        clipboardSnapshot ? restoreClipboardPayload(clipboard, clipboardSnapshot) : undefined

      if (
        !request.matchedInstruction ||
        request.matchedInstruction.autoEnterMode === 'off' ||
        !ownershipMatchedAtDelivery
      ) {
        const restoreFailureMessage = restoreClipboardIfNeeded()
        if (restoreFailureMessage) {
          return {
            ...successResult,
            failureMessage: combineFailureMessages(waitFailureMessage, restoreFailureMessage)
          }
        }

        if (waitFailureMessage) {
          return {
            ...successResult,
            failureMessage: waitFailureMessage
          }
        }

        return successResult
      }

      try {
        await deps.triggerAutoEnter(request.matchedInstruction.autoEnterMode)
        const restoreFailureMessage = restoreClipboardIfNeeded()

        if (restoreFailureMessage) {
          return {
            ...successResult,
            autoSendTriggered: true,
            failureMessage: combineFailureMessages(waitFailureMessage, restoreFailureMessage)
          }
        }

        return {
          ...successResult,
          autoSendTriggered: true,
          ...(waitFailureMessage ? { failureMessage: waitFailureMessage } : {})
        }
      } catch (error) {
        const restoreFailureMessage = restoreClipboardIfNeeded()
        return {
          ...successResult,
          failureMessage: combineFailureMessages(
            waitFailureMessage,
            normalizeErrorMessage(error),
            restoreFailureMessage
          )
        }
      }
    }
  }
}

export type {
  ClipboardAccess,
  ClipboardPasteAttemptResult,
  DeliveryInstruction,
  DeliveryRequest,
  DeliveryResult
}
