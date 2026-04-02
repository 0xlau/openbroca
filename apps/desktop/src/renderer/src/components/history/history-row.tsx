import { TypographyMuted, TypographySmall } from '@openbroca/ui'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../../main/trpc/router'

type HistoryListItem = inferRouterOutputs<AppRouter>['history']['list'][number]

export function HistoryRow({
  item,
  isSelected,
  onSelect
}: {
  item: HistoryListItem
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const preview = item.finalText ?? item.failureMessage ?? 'Processing...'

  return (
    <div
      className={`flex w-full items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/50 ${
        isSelected ? 'bg-foreground/5' : ''
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-4 text-left"
        onClick={() => onSelect(item.id)}
        aria-pressed={isSelected}
        aria-label={`Select history item ${item.id}`}
      >
        <TypographyMuted className="w-40 shrink-0">
          {new Date(item.createdAt).toLocaleString()}
        </TypographyMuted>
        <div className="min-w-0 flex flex-1 flex-col gap-1">
          <TypographySmall className="font-medium capitalize">{item.status}</TypographySmall>
          <TypographySmall className="truncate font-normal">{preview}</TypographySmall>
        </div>
      </button>
      {item.audioFileUrl ? (
        <audio
          aria-label={`Replay ${item.id}`}
          className="w-40 shrink-0"
          controls
          preload="none"
          src={item.audioFileUrl}
        />
      ) : null}
    </div>
  )
}
