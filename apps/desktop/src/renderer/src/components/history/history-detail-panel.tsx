import { TypographyLarge, TypographyMuted, TypographySmall } from '@openbroca/ui'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../../main/trpc/router'

type HistoryDetail = inferRouterOutputs<AppRouter>['history']['getById']

export function HistoryDetailPanel({
  record,
  debugMode
}: {
  record: HistoryDetail | null
  debugMode: boolean
}) {
  if (!record) {
    return (
      <div className="rounded-xl p-4 ring-1 ring-foreground/10">
        <TypographyLarge>Details</TypographyLarge>
        <TypographyMuted className="mt-2">Select a history item to inspect it.</TypographyMuted>
      </div>
    )
  }

  const summary = record.finalText ?? record.failureMessage ?? ''

  return (
    <div className="rounded-xl p-4 ring-1 ring-foreground/10">
      <TypographyLarge>Details</TypographyLarge>
      <TypographySmall className="mt-3 whitespace-pre-wrap font-normal">{summary}</TypographySmall>
      {record.audioFileUrl ? (
        <audio
          aria-label="History audio playback"
          className="mt-4 w-full"
          controls
          preload="none"
          src={record.audioFileUrl}
        />
      ) : null}
      {debugMode ? (
        <div className="mt-4 space-y-3">
          <div>
            <TypographyMuted>ASR Transcript</TypographyMuted>
            <pre className="mt-1 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
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
      ) : null}
    </div>
  )
}
