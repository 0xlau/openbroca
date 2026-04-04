import React from 'react'
import type { AppIdentity } from '@openbroca/app-identity'
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@openbroca/ui'
import type { InstructionActivationApp } from '@renderer/stores/instructions-store'

interface ActivationAppPickerProps {
  value: InstructionActivationApp[]
  detectedApps: AppIdentity[]
  ownedAppNamesById: Record<string, string>
  onChange: (apps: InstructionActivationApp[]) => void
}

function getSecondaryIdentity(app: InstructionActivationApp): string {
  return app.bundleId ?? app.aumid ?? app.path ?? app.id
}

function toSearchText(app: InstructionActivationApp): string {
  return `${app.displayName} ${app.id} ${app.bundleId ?? ''} ${app.aumid ?? ''} ${app.path ?? ''}`.toLowerCase()
}

function ActivationAppIcon({
  app,
  placeholderTestId
}: {
  app: InstructionActivationApp
  placeholderTestId: string
}) {
  if (app.iconDataUrl) {
    return (
      <img
        src={app.iconDataUrl}
        alt={`${app.displayName} icon`}
        className="h-4 w-4 shrink-0 rounded-sm object-cover"
      />
    )
  }

  return (
    <span
      className="h-4 w-4 shrink-0 rounded-sm bg-muted"
      data-testid={placeholderTestId}
      aria-hidden="true"
    />
  )
}

export function ActivationAppPicker({
  value,
  detectedApps,
  ownedAppNamesById,
  onChange
}: ActivationAppPickerProps) {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')

  const selectedIds = React.useMemo(() => new Set(value.map((app) => app.id)), [value])

  const filteredApps = React.useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return detectedApps
    }

    return detectedApps.filter((app) => toSearchText(app).includes(keyword))
  }, [detectedApps, searchTerm])

  function addApp(app: InstructionActivationApp) {
    if (selectedIds.has(app.id)) {
      return
    }

    onChange([...value, app])
  }

  function removeApp(appId: string) {
    onChange(value.filter((app) => app.id !== appId))
  }

  function handlePickerOpenChange(nextOpen: boolean) {
    setIsPickerOpen(nextOpen)
    if (!nextOpen) {
      setSearchTerm('')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Activation apps</p>
        <Popover open={isPickerOpen} onOpenChange={handlePickerOpenChange}>
          <PopoverTrigger asChild>
            <Button type="button" size="xs" variant="outline" className="shrink-0">
              Select apps
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            data-testid="activation-app-popover"
            className="w-80 max-h-[min(50vh,360px)] overflow-y-auto p-2"
          >
            <Command className="rounded-xl border border-border/60 bg-transparent">
              <CommandInput
                value={searchTerm}
                onValueChange={setSearchTerm}
                placeholder="Search apps"
                className="h-8"
              />
              <CommandList>
                <CommandEmpty>No apps found.</CommandEmpty>
                <CommandGroup heading="Detected apps">
                  {filteredApps.map((app) => {
                    const ownerName = ownedAppNamesById[app.id]
                    const isOwnedByOtherRule = Boolean(ownerName)
                    const isSelected = selectedIds.has(app.id)
                    const addButtonLabel = isOwnedByOtherRule
                      ? `Add ${app.displayName} (owned by ${ownerName})`
                      : `Add ${app.displayName}`

                    return (
                      <CommandItem
                        key={app.id}
                        value={toSearchText(app)}
                        disabled={isOwnedByOtherRule || isSelected}
                        onSelect={() => {
                          if (isOwnedByOtherRule || isSelected) {
                            return
                          }
                          addApp(app)
                        }}
                        className="items-start gap-3 py-2.5"
                      >
                        <ActivationAppIcon
                          app={app}
                          placeholderTestId={`activation-app-icon-placeholder-${app.id}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{app.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {isOwnedByOtherRule
                              ? `Owned by ${ownerName}`
                              : isSelected
                                ? 'Already selected'
                                : getSecondaryIdentity(app)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isOwnedByOtherRule || isSelected}
                          aria-label={addButtonLabel}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            if (isOwnedByOtherRule || isSelected) {
                              return
                            }
                            addApp(app)
                          }}
                        >
                          {isSelected ? 'Added' : 'Add'}
                        </Button>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap gap-2">
        {value.length > 0 ? (
          value.map((app) => (
            <Badge key={app.id} variant="outline" className="h-auto items-center gap-1 py-1.5 pr-1">
              <ActivationAppIcon app={app} placeholderTestId={`selected-app-icon-placeholder-${app.id}`} />
              <span>{app.displayName}</span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label={`Remove ${app.displayName}`}
                onClick={() => removeApp(app.id)}
              >
                Remove
              </Button>
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No activation apps selected yet.</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Apps already owned by another instruction are disabled.</p>
    </div>
  )
}
