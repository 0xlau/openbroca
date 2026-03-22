import * as React from 'react'

function TitleBarButton({
  onClick,
  children,
  className = ''
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 w-11 items-center justify-center transition-colors duration-100 ${className}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {children}
    </button>
  )
}

export function WindowsTitleBar() {
  const minimize = () => window.api.windowControls.minimize()
  const maximize = () => window.api.windowControls.maximize()
  const close = () => window.api.windowControls.close()

  return (
    <div
      className="bg-sidebar flex h-8 w-full shrink-0 select-none items-center justify-end"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <TitleBarButton
        onClick={minimize}
        className="text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </TitleBarButton>

      <TitleBarButton
        onClick={maximize}
        className="text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="9" height="9" strokeWidth="1" />
        </svg>
      </TitleBarButton>

      <TitleBarButton
        onClick={close}
        className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <line x1="0" y1="0" x2="10" y2="10" strokeWidth="1.2" />
          <line x1="10" y1="0" x2="0" y2="10" strokeWidth="1.2" />
        </svg>
      </TitleBarButton>
    </div>
  )
}
