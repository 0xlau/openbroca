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
import {
  getInstructionActivationAppStableIdentityKeys,
  instructionActivationAppsShareStableIdentity
} from '../../../../shared/instructions'

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

function buildOwnedAppNamesByKey(
  rules: InstructionRule[],
  excludedRuleId: string | null
): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const rule of rules) {
    if (excludedRuleId && rule.id === excludedRuleId) {
      continue
    }

    for (const app of rule.activationApps) {
      for (const stableIdentityKey of getInstructionActivationAppStableIdentityKeys(app)) {
        mapping[stableIdentityKey] = rule.name
      }
    }
  }

  return mapping
}

function removeActivationAppByOwnershipKey(
  activationApps: InstructionRule['activationApps'],
  app: InstructionRule['activationApps'][number]
): InstructionRule['activationApps'] {
  return activationApps.filter(
    (candidate) => !instructionActivationAppsShareStableIdentity(candidate, app)
  )
}

function replaceActivationAppByOwnershipKey(
  activationApps: InstructionRule['activationApps'],
  app: InstructionRule['activationApps'][number]
): InstructionRule['activationApps'] {
  return [...removeActivationAppByOwnershipKey(activationApps, app), app]
}

function toSortedDetectedApps(apps: AppIdentity[] | undefined): AppIdentity[] {
  if (!apps) {
    return []
  }

  return [...apps].sort((left, right) => left.displayName.localeCompare(right.displayName))
}

function cloneRulesSnapshot(rules: InstructionRule[]): InstructionRule[] {
  return rules.map((rule) => ({
    ...rule,
    activationApps: rule.activationApps.map((app) => ({ ...app }))
  }))
}

export const Instructions: React.FC = () => {
  const { data, isHydrated, replace } = useStore(instructionsStore)
  const [editorState, setEditorState] = React.useState<EditorState>(INITIAL_EDITOR_STATE)
  const [draftRules, setDraftRules] = React.useState<InstructionRule[] | null>(null)
  const [isPersisting, setIsPersisting] = React.useState(false)
  const [editorErrorMessage, setEditorErrorMessage] = React.useState<string | null>(null)
  const [pageErrorMessage, setPageErrorMessage] = React.useState<string | null>(null)
  const { data: detectedAppsRaw } = trpc.appIdentity.listApps.useQuery()

  const detectedApps = React.useMemo(() => toSortedDetectedApps(detectedAppsRaw), [detectedAppsRaw])

  const ownedAppNamesByKey = React.useMemo(
    () => buildOwnedAppNamesByKey(draftRules ?? data.rules, editorState.rule?.id ?? null),
    [data.rules, draftRules, editorState.rule?.id]
  )

  const mode = editorState.rule ? 'edit' : 'create'

  async function handleSave(value: InstructionEditorValue): Promise<void> {
    if (isPersisting) {
      return
    }

    setIsPersisting(true)
    setEditorErrorMessage(null)
    setPageErrorMessage(null)

    const editingRuleId = editorState.rule?.id ?? null
    const nextRule: InstructionRule = {
      id: editingRuleId ?? createRuleId(),
      name: value.name,
      activationApps: value.activationApps,
      customInstructions: value.customInstructions,
      autoEnterMode: value.autoEnterMode
    }
    const persistedRules = cloneRulesSnapshot(instructionsStore.getState().data.rules)
    const previousRules = cloneRulesSnapshot(draftRules ?? persistedRules)

    try {
      const nextRules = editingRuleId
        ? previousRules.map((rule) => (rule.id === editingRuleId ? nextRule : rule))
        : [...previousRules, nextRule]

      await replace({ rules: nextRules })
      setDraftRules(null)
      setEditorState(INITIAL_EDITOR_STATE)
    } catch (error) {
      instructionsStore.setState((state) => ({
        ...state,
        data: {
          ...state.data,
          rules: persistedRules
        }
      }))
      setDraftRules(previousRules)
      setEditorErrorMessage(
        error instanceof Error ? error.message : 'Failed to save instruction. Please try again.'
      )
    } finally {
      setIsPersisting(false)
    }
  }

  async function handleDelete(ruleId: string) {
    if (isPersisting) {
      return
    }

    setIsPersisting(true)
    setPageErrorMessage(null)
    const previousRules = cloneRulesSnapshot(instructionsStore.getState().data.rules)

    try {
      await replace({
        rules: previousRules.filter((rule) => rule.id !== ruleId)
      })
    } catch (error) {
      instructionsStore.setState((state) => ({
        ...state,
        data: {
          ...state.data,
          rules: previousRules
        }
      }))
      setPageErrorMessage(
        error instanceof Error ? error.message : 'Failed to delete instruction. Please try again.'
      )
    } finally {
      setIsPersisting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TypographyH3 className="text-left">Instructions</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Create app-specific instruction rules with custom prompts and auto-enter behavior.
          </TypographyMuted>
        </div>

        <Button
          type="button"
          className="shrink-0"
          disabled={isPersisting}
          onClick={() => {
            setEditorErrorMessage(null)
            setPageErrorMessage(null)
            setDraftRules(cloneRulesSnapshot(data.rules))
            setEditorState({ open: true, rule: null })
          }}
        >
          New instruction
        </Button>
      </div>

      {pageErrorMessage ? <p className="text-sm text-destructive">{pageErrorMessage}</p> : null}

      {!isHydrated ? (
        <TypographyMuted>Loading instructions...</TypographyMuted>
      ) : (
        <section>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="instructions-grid">
            {data.rules.length > 0 ? (
              data.rules.map((rule) => (
                <InstructionCard
                  key={rule.id}
                  rule={rule}
                  disabled={isPersisting}
                  onEdit={() => {
                    setEditorErrorMessage(null)
                    setPageErrorMessage(null)
                    setEditorState({ open: true, rule })
                  }}
                  onDelete={() => handleDelete(rule.id)}
                />
              ))
            ) : (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="flex flex-1">
                  <Empty className="min-h-90 flex-1 border border-dashed border-border/70 p-10">
                    <EmptyHeader>
                      <EmptyTitle>No instructions yet</EmptyTitle>
                      <EmptyDescription>
                        Add your first rule to bind custom instructions to one or more activation
                        apps.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        type="button"
                        disabled={isPersisting}
                        onClick={() => {
                          setEditorErrorMessage(null)
                          setPageErrorMessage(null)
                          setDraftRules(cloneRulesSnapshot(data.rules))
                          setEditorState({ open: true, rule: null })
                        }}
                      >
                        Create instruction
                      </Button>
                    </EmptyContent>
                  </Empty>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      <InstructionEditorDialog
        mode={mode}
        open={editorState.open}
        rule={editorState.rule}
        detectedApps={detectedApps}
        ownedAppNamesByKey={ownedAppNamesByKey}
        isSubmitting={isPersisting}
        errorMessage={editorErrorMessage}
        onOpenChange={(open) => {
          if (isPersisting) {
            return
          }
          setEditorState((current) => (open ? current : INITIAL_EDITOR_STATE))
          if (!open) {
            setDraftRules(null)
            setEditorErrorMessage(null)
          }
        }}
        onTransferApp={(app) => {
          setDraftRules((current) => {
            const baseRules = cloneRulesSnapshot(current ?? data.rules)
            const currentRuleId = editorState.rule?.id

            if (!currentRuleId) {
              return baseRules.map((candidate) => ({
                ...candidate,
                activationApps: removeActivationAppByOwnershipKey(candidate.activationApps, app)
              }))
            }

            return baseRules.map((candidate) => {
              if (candidate.id === currentRuleId) {
                return {
                  ...candidate,
                  activationApps: replaceActivationAppByOwnershipKey(candidate.activationApps, app)
                }
              }

              return {
                ...candidate,
                activationApps: removeActivationAppByOwnershipKey(candidate.activationApps, app)
              }
            })
          })
        }}
        onSubmit={handleSave}
      />
    </div>
  )
}
