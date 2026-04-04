import React from 'react'
import type { AppIdentity } from '@openbroca/app-identity'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import type { InstructionActivationApp } from '@renderer/stores/instructions-store'

interface ActivationAppPickerProps {
  value: InstructionActivationApp[]
  detectedApps: AppIdentity[]
  ownedAppNamesById: Record<string, string>
  onTransferApp?: (app: InstructionActivationApp) => void
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
  onTransferApp,
  onChange
}: ActivationAppPickerProps) {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [pendingTransferApp, setPendingTransferApp] = React.useState<InstructionActivationApp | null>(
    null
  )

  const selectedIds = React.useMemo(() => new Set(value.map((app) => app.id)), [value])

  const filteredApps = React.useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return detectedApps
    }

    return detectedApps.filter((app) => toSearchText(app).includes(keyword))
  }, [detectedApps, searchTerm])

  function removeApp(appId: string) {
    onChange(value.filter((app) => app.id !== appId))
  }

  function toggleApp(app: InstructionActivationApp) {
    if (selectedIds.has(app.id)) {
      onChange(value.filter((candidate) => candidate.id !== app.id))
      return
    }

    if (ownedAppNamesById[app.id]) {
      setPendingTransferApp(app)
      return
    }

    onChange([...value, app])
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
          className="w-80 p-2"
        >
          <Command
            data-testid="activation-app-popover-command"
            className="max-h-[min(50vh,360px)] rounded-xl border border-border/60 bg-transparent"
          >
            <CommandInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder="Search apps"
              className="h-8"
            />
            <div
              data-testid="activation-app-popover-scroll"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <CommandList>
                  <CommandEmpty>No apps found.</CommandEmpty>
                  <CommandGroup heading="Detected apps">
                    {filteredApps.map((app) => {
                      const ownerName = ownedAppNamesById[app.id]
                      const isOwnedByOtherRule = Boolean(ownerName)
                      const isSelected = selectedIds.has(app.id)

                      return (
                        <CommandItem
                          key={app.id}
                          data-testid={`activation-app-row-${app.id}`}
                          value={toSearchText(app)}
                          onSelect={() => toggleApp(app)}
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
                                ? `Used by ${ownerName}`
                                : isSelected
                                  ? 'Selected'
                                  : getSecondaryIdentity(app)}
                            </p>
                          </div>
                          {isSelected ? (
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              strokeWidth={2}
                              className="size-4 shrink-0"
                              data-testid={`activation-app-selected-icon-${app.id}`}
                            />
                          ) : null}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </div>
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
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                  data-testid={`selected-app-remove-icon-${app.id}`}
                />
              </Button>
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No activation apps selected yet.</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Apps already owned by another instruction can be transferred.
      </p>

      <AlertDialog
        open={Boolean(pendingTransferApp)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingTransferApp(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move app to this instruction?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTransferApp
                ? `${pendingTransferApp.displayName} will be removed from ${ownedAppNamesById[pendingTransferApp.id]} and added to the instruction you are editing.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingTransferApp) {
                  return
                }

                onTransferApp?.(pendingTransferApp)
                onChange([
                  ...value.filter((candidate) => candidate.id !== pendingTransferApp.id),
                  pendingTransferApp
                ])
                setPendingTransferApp(null)
                setIsPickerOpen(true)
              }}
            >
              Transfer app
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
