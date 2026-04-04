import { Badge, Button, Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@openbroca/ui'
import type { InstructionRule } from '@renderer/stores/instructions-store'

interface InstructionCardProps {
  rule: InstructionRule
  disabled?: boolean
  onEdit: () => void | Promise<void>
  onDelete: () => void | Promise<void>
}

function InstructionCardAppIcon({
  app
}: {
  app: InstructionRule['activationApps'][number]
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
      data-testid={`instruction-card-app-icon-placeholder-${app.id}`}
      aria-hidden="true"
    />
  )
}

export function InstructionCard({ rule, disabled = false, onEdit, onDelete }: InstructionCardProps) {
  const appCountLabel = `${rule.activationApps.length} ${rule.activationApps.length === 1 ? 'app' : 'apps'}`
  const instructionPreview = rule.customInstructions.trim() || 'No custom instructions.'
  // Compatibility bridge until the card is fully enum-driven.
  const autoEnterEnabled = rule.autoEnterMode ? rule.autoEnterMode !== 'off' : (rule.autoEnter ?? false)

  return (
    <Card className="h-full gap-4" size="sm">
      <CardHeader>
        <CardTitle className="truncate">{rule.name}</CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Edit ${rule.name}`}
            disabled={disabled}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Delete ${rule.name}`}
            disabled={disabled}
            onClick={onDelete}
          >
            Delete
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{appCountLabel}</Badge>
          <Badge variant={autoEnterEnabled ? 'default' : 'outline'}>
            {autoEnterEnabled ? 'Auto enter on' : 'Auto enter off'}
          </Badge>
        </div>

        {rule.activationApps.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {rule.activationApps.map((app) => (
              <Badge key={app.id} variant="outline" className="items-center gap-1">
                <InstructionCardAppIcon app={app} />
                {app.displayName}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No activation apps selected.</p>
        )}
      </CardContent>

      <CardFooter className="border-t text-sm text-muted-foreground">{instructionPreview}</CardFooter>
    </Card>
  )
}
