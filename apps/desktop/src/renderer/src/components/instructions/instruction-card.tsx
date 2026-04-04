import { Badge, Button, Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@openbroca/ui'
import type { InstructionRule } from '@renderer/stores/instructions-store'

interface InstructionCardProps {
  rule: InstructionRule
  disabled?: boolean
  onEdit: () => void | Promise<void>
  onDelete: () => void | Promise<void>
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
              <Badge key={app.id} variant="outline">
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
