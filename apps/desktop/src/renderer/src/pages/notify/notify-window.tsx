import React, { useEffect } from 'react'
import { Button, cn } from '@openbroca/ui'
import { useStore } from 'zustand'
import { notifyWindowStore } from '@renderer/stores/notify-window-store'

export const NotifyWindow: React.FC = () => {
  useEffect(() => {
    document.body.classList.add('bg-transparent')
    return () => document.body.classList.remove('bg-transparent')
  }, [])

  const { bridge } = useStore(notifyWindowStore)
  const notification = bridge.notification
  const actions = notification?.actions ?? []
  const showActions = actions.length > 0

  if (!notification) {
    return <div className="min-h-screen bg-transparent" />
  }

  return (
    <div className="min-h-screen bg-transparent p-4">
      <div
        className={cn(
          'bg-background/95 text-foreground border-border/70 flex h-full min-h-[56px] w-full items-center',
          'rounded-[20px] border px-4 py-3 shadow-lg backdrop-blur'
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{notification.title}</p>
          {notification.body ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{notification.body}</p>
          ) : null}
        </div>

        {showActions ? (
          <div
            className="ml-3 flex min-h-8 shrink-0 items-center justify-end gap-2"
            data-testid="notify-window-actions"
          >
            {actions.map((action) => (
              <Button key={action.id} type="button" size="sm" variant="secondary" disabled>
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
