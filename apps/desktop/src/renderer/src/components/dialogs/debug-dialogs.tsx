import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../../main/trpc/router'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'

type HistoryDetail = inferRouterOutputs<AppRouter>['history']['getById']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function formatAppSummary(app: unknown): string {
  if (!isRecord(app)) {
    return 'Unavailable'
  }

  return (
    readString(app.displayName) ??
    readString(app.bundleId) ??
    readString(app.id) ??
    readString(app.path) ??
    'Unavailable'
  )
}

function formatValue(value: unknown, fallback = 'Unavailable'): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return readString(value) ?? fallback
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <TypographyMuted>{label}</TypographyMuted>
      <TypographySmall className="mt-1 whitespace-pre-wrap font-normal">{value}</TypographySmall>
    </div>
  )
}

function formatFailureStage(stage: unknown): string {
  return readString(stage)?.toUpperCase() ?? 'UNKNOWN'
}

export function DebugDialogs({
  open,
  onOpenChange,
  record,
  isLoading,
  isError
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: HistoryDetail | null
  debugMode: boolean
  isLoading: boolean
  isError: boolean
}) {
  const llmRequest = isRecord(record?.debug.llmRequest) ? record.debug.llmRequest : null
  const delivery = record?.debug.delivery ?? null
  const matchedInstruction = delivery?.matchedInstruction ?? null
  const copyDebugPayload = async () => {
    if (!record || !globalThis.navigator?.clipboard?.writeText) {
      return
    }

    try {
      await globalThis.navigator.clipboard.writeText(JSON.stringify(record, null, 2))
    } catch (error) {
      console.error('[debug-dialogs] failed to copy debug payload', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>Debug</DialogTitle>
          <DialogDescription>
            Inspect the transcription result, audio, and debug payload.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <TypographyMuted>Loading details...</TypographyMuted>
          ) : isError ? (
            <TypographyMuted>Failed to load details.</TypographyMuted>
          ) : !record ? (
            <TypographyMuted>Select a history item to inspect it.</TypographyMuted>
          ) : (
            <div>
              {record.failureMessage ? (
                <Alert variant="destructive">
                  <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
                  <AlertTitle>{`${formatFailureStage(record.failureStage)} failed`}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {record.failureMessage}
                  </AlertDescription>
                </Alert>
              ) : (
                <TypographySmall className="whitespace-pre-wrap font-normal">
                  {record.finalText ?? ''}
                </TypographySmall>
              )}
              {record.audioFileUrl ? (
                <audio
                  aria-label="History audio playback"
                  className="mt-4 w-full"
                  controls
                  preload="none"
                  src={record.audioFileUrl}
                />
              ) : null}

              <div className="mt-4 space-y-3">
                <div>
                  <TypographyMuted>Delivery Summary</TypographyMuted>
                  <div className="mt-1 grid gap-3 md:grid-cols-2">
                    <SummaryRow
                      label="Instruction Prompt Applied"
                      value={formatValue(delivery?.instructionPromptApplied)}
                    />
                    <SummaryRow
                      label="Ownership Matched At Delivery"
                      value={formatValue(delivery?.ownershipMatchedAtDelivery)}
                    />
                    <SummaryRow label="Delivery Method" value={formatValue(delivery?.method)} />
                    <SummaryRow
                      label="Delivery Outcome"
                      value={formatValue(delivery?.outcome)}
                    />
                    <SummaryRow
                      label="Paste Attempted"
                      value={formatValue(delivery?.pasteAttempted)}
                    />
                    <SummaryRow
                      label="Auto Send Triggered"
                      value={formatValue(delivery?.autoSendTriggered)}
                    />
                    <SummaryRow
                      label="Fallback Reason"
                      value={formatValue(delivery?.fallbackReason, 'None')}
                    />
                  </div>
                </div>
                <div>
                  <TypographyMuted>Pipeline Context</TypographyMuted>
                  <div className="mt-1 grid gap-3 md:grid-cols-2">
                    <SummaryRow label="Record Status" value={record.status} />
                    <SummaryRow
                      label="Failure Stage"
                      value={record.failureStage ? formatFailureStage(record.failureStage) : 'None'}
                    />
                    <SummaryRow
                      label="ASR Provider"
                      value={record.asrProviderId ?? 'Unavailable'}
                    />
                    <SummaryRow
                      label="LLM Provider"
                      value={record.llmProviderId ?? 'Unavailable'}
                    />
                    <SummaryRow label="LLM Model" value={formatValue(llmRequest?.model)} />
                    <SummaryRow
                      label="Frontmost App At Capture"
                      value={formatAppSummary(record.debug.frontmostAppSnapshot)}
                    />
                    <SummaryRow
                      label="Target App At Match"
                      value={formatAppSummary(delivery?.targetAppAtMatch)}
                    />
                    <SummaryRow
                      label="Target App At Delivery"
                      value={formatAppSummary(delivery?.targetAppAtDelivery)}
                    />
                    <SummaryRow
                      label="Matched Instruction"
                      value={matchedInstruction?.name ?? 'None'}
                    />
                    <SummaryRow
                      label="Matched Instruction Rule ID"
                      value={matchedInstruction?.ruleId ?? 'None'}
                    />
                    <SummaryRow
                      label="Auto Enter Mode"
                      value={matchedInstruction?.autoEnterMode ?? 'off'}
                    />
                  </div>
                </div>
                <div>
                  <TypographyMuted>ASR Transcript</TypographyMuted>
                  <pre className="mt-1 min-h-[4.5rem] overflow-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                    {record.debug.rawTranscriptionText}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>ASR Request</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.asrRequest, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>ASR Response</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.asrResponseSummary, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>ASR Segments</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.asrSegments, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>LLM Request</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.llmRequest, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>LLM Response</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.llmResponseSummary, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>Token Usage</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.tokenUsage ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>Frontmost App Snapshot</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.frontmostAppSnapshot ?? null, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>Delivery</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.delivery, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>Timeline</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.timeline, null, 2)}
                  </pre>
                </div>
                <div>
                  <TypographyMuted>Errors</TypographyMuted>
                  <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                    {JSON.stringify(record.debug.errors, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            aria-label="Copy debug JSON"
            disabled={!record}
            onClick={() => void copyDebugPayload()}
            size="sm"
          >
            Copy Debug JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
