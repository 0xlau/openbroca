import {
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
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
                  <AlertTitle>Failed</AlertTitle>
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
      </DialogContent>
    </Dialog>
  )
}
