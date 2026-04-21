import React from 'react'
import { Bug02Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button, TypographyMuted, TypographySmall } from '@openbroca/ui'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../../main/trpc/router'

type HistoryListItem = inferRouterOutputs<AppRouter>['history']['list'][number]

function formatFailureStage(stage: HistoryListItem['failureStage']): string {
  if (typeof stage !== 'string' || stage.length === 0) {
    return 'Failed'
  }

  return `${stage.toUpperCase()} failed`
}

export function HistoryRow({
  item,
  onOpenDetails
}: {
  item: HistoryListItem
  onOpenDetails: (id: string) => void
}) {
  const preview =
    item.status === 'failed'
      ? item.failureMessage
        ? `${formatFailureStage(item.failureStage)}: ${item.failureMessage}`
        : formatFailureStage(item.failureStage)
      : item.finalText ?? 'Processing...'
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)

  const handleTogglePlayback = React.useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !item.audioFileUrl) {
      return
    }

    if (isPlaying) {
      audio.pause()
      return
    }

    try {
      await audio.play()
    } catch (error) {
      console.error('Failed to play history audio', error)
    }
  }, [isPlaying, item.audioFileUrl])

  return (
    <div className="flex w-full items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <TypographyMuted className="w-40 shrink-0 text-xs pt-0.75">
        {new Date(item.createdAt).toLocaleString()}
      </TypographyMuted>
      <TypographySmall className="min-w-0 flex-1 line-clamp-3 leading-normal font-normal">
        {preview}
      </TypographySmall>
      {item.audioFileUrl ? (
        <>
          <audio
            ref={audioRef}
            className="hidden"
            preload="none"
            src={item.audioFileUrl}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 rounded-full"
            onClick={handleTogglePlayback}
            aria-label={isPlaying ? 'Pause history audio' : 'Play history audio'}
          >
            <HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} strokeWidth={2} size={16} />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="shrink-0 rounded-full"
        onClick={() => onOpenDetails(item.id)}
        aria-label="Show history details"
      >
        <HugeiconsIcon icon={Bug02Icon} strokeWidth={2} size={16} />
      </Button>
    </div>
  )
}
