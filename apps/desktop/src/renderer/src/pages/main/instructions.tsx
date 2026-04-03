import React from 'react'
import type { AppIdentity } from '@openbroca/app-identity'
import {
  Button,
  Card,
  CardContent,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  TypographyH3,
  TypographyMuted
} from '@openbroca/ui'
import { InstructionCard } from '@renderer/components/instructions/instruction-card'
import {
  InstructionEditorDialog,
  type InstructionEditorValue
} from '@renderer/components/instructions/instruction-editor-dialog'
import { instructionsStore, type InstructionRule } from '@renderer/stores/instructions-store'
import { trpc } from '@renderer/trpc'
import { useStore } from 'zustand'

interface EditorState {
  open: boolean
  rule: InstructionRule | null
}

const INITIAL_EDITOR_STATE: EditorState = {
  open: false,
  rule: null
}

function createRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `instruction-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildOwnedAppNamesById(rules: InstructionRule[], excludedRuleId: string | null): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const rule of rules) {
    if (excludedRuleId && rule.id === excludedRuleId) {
      continue
    }

    for (const app of rule.activationApps) {
      mapping[app.id] = rule.name
    }
  }

  return mapping
}

function toSortedDetectedApps(apps: AppIdentity[] | undefined): AppIdentity[] {
  if (!apps) {
    return []
  }

  return [...apps].sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export const Instructions: React.FC = () => {
  const { data, isHydrated, replace } = useStore(instructionsStore)
  const [editorState, setEditorState] = React.useState<EditorState>(INITIAL_EDITOR_STATE)
  const { data: detectedAppsRaw } = trpc.appIdentity.listApps.useQuery()

  const detectedApps = React.useMemo(() => toSortedDetectedApps(detectedAppsRaw), [detectedAppsRaw])

  const ownedAppNamesById = React.useMemo(
    () => buildOwnedAppNamesById(data.rules, editorState.rule?.id ?? null),
    [data.rules, editorState.rule?.id]
  )

  const mode = editorState.rule ? 'edit' : 'create'

  async function handleSave(value: InstructionEditorValue) {
    const nextRule: InstructionRule = {
      id: editorState.rule?.id ?? createRuleId(),
      name: value.name,
      activationApps: value.activationApps,
      customInstructions: value.customInstructions,
      autoEnter: value.autoEnter
    }

    const nextRules = editorState.rule
      ? data.rules.map((rule) => (rule.id === editorState.rule?.id ? nextRule : rule))
      : [...data.rules, nextRule]

    await replace({ rules: nextRules })
    setEditorState(INITIAL_EDITOR_STATE)
  }

  async function handleDelete(ruleId: string) {
    await replace({
      rules: data.rules.filter((rule) => rule.id !== ruleId)
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TypographyH3 className="text-left">Instructions</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Create app-specific instruction rules with custom prompts and auto-enter behavior.
          </TypographyMuted>
        </div>

        <Button type="button" className="shrink-0" onClick={() => setEditorState({ open: true, rule: null })}>
          New instruction
        </Button>
      </div>

      {!isHydrated ? (
        <TypographyMuted>Loading instructions...</TypographyMuted>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="instructions-grid">
          {data.rules.length > 0 ? (
            data.rules.map((rule) => (
              <InstructionCard
                key={rule.id}
                rule={rule}
                onEdit={() => setEditorState({ open: true, rule })}
                onDelete={() => void handleDelete(rule.id)}
              />
            ))
          ) : (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent>
                <Empty className="border border-dashed border-border/70 p-10">
                  <EmptyHeader>
                    <EmptyTitle>No instructions yet</EmptyTitle>
                    <EmptyDescription>
                      Add your first rule to bind custom instructions to one or more activation apps.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button type="button" onClick={() => setEditorState({ open: true, rule: null })}>
                      Create instruction
                    </Button>
                  </EmptyContent>
                </Empty>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <InstructionEditorDialog
        mode={mode}
        open={editorState.open}
        rule={editorState.rule}
        detectedApps={detectedApps}
        ownedAppNamesById={ownedAppNamesById}
        onOpenChange={(open) => {
          setEditorState((current) => (open ? current : INITIAL_EDITOR_STATE))
        }}
        onSubmit={(value) => {
          void handleSave(value)
        }}
      />
    </div>
  )
}
