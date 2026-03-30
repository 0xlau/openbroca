import React, { useMemo, useState } from 'react'
import { ArrowRight02Icon, Delete02Icon, Pen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Separator,
  Switch,
  Textarea,
  TypographyH3,
  TypographyMuted,
  TypographySmall
} from '@openbroca/ui'
import {
  dictionaryStore,
  type DictionaryEntry,
  type DictionarySettings
} from '@renderer/stores/dictionary-store'
import { useStore } from 'zustand'

interface DictionaryDraft {
  term: string
  replacement: string
  isReplacement: boolean
  note: string
}

const EMPTY_DRAFT: DictionaryDraft = {
  term: '',
  replacement: '',
  isReplacement: false,
  note: ''
}

function createEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `hotword-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toDraft(entry?: DictionaryEntry): DictionaryDraft {
  const isReplacement = entry?.type === 'replacement'

  return {
    term: entry?.term ?? '',
    replacement: isReplacement ? (entry?.replacement ?? '') : '',
    isReplacement,
    note: entry?.note ?? ''
  }
}

function createDictionaryEntry(draft: DictionaryDraft): DictionaryEntry {
  const now = new Date().toISOString()

  return {
    id: createEntryId(),
    term: draft.term.trim(),
    type: draft.isReplacement ? 'replacement' : 'hotword',
    replacement: draft.isReplacement ? draft.replacement.trim() : undefined,
    note: draft.note.trim() || undefined,
    usageCount: 0,
    createdAt: now,
    updatedAt: now
  }
}

function updateDictionaryEntry(entry: DictionaryEntry, draft: DictionaryDraft): DictionaryEntry {
  return {
    ...entry,
    term: draft.term.trim(),
    type: draft.isReplacement ? 'replacement' : 'hotword',
    replacement: draft.isReplacement ? draft.replacement.trim() : undefined,
    note: draft.note.trim() || undefined,
    updatedAt: new Date().toISOString()
  }
}

function getEntryType(entry: DictionaryEntry): 'hotword' | 'replacement' {
  return entry.type === 'replacement' ? 'replacement' : 'hotword'
}

function DictionaryEditor({
  mode,
  open,
  draft,
  onDraftChange,
  onOpenChange,
  onSubmit,
  submitLabel
}: {
  mode: 'create' | 'edit'
  open: boolean
  draft: DictionaryDraft
  onDraftChange: (draft: DictionaryDraft) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  submitLabel: string
}) {
  const term = draft.term.trim()
  const replacement = draft.replacement.trim()
  const isReplacement = draft.isReplacement
  const canSubmit = isReplacement ? Boolean(term && replacement) : Boolean(term)
  const title =
    mode === 'edit'
      ? isReplacement
        ? 'Edit replacement'
        : 'Edit hotword'
      : isReplacement
        ? 'Add a replacement'
        : 'Add Hotword'
  const description = isReplacement
    ? mode === 'edit'
      ? 'Update the source word, replacement text, or note without changing the current usage count.'
      : 'Replacements are stored locally and map one phrase to the one you want to keep.'
    : mode === 'edit'
      ? 'Update the term or note without changing the current usage count.'
      : 'Hotwords are stored locally and their usage count starts at zero.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) {
              return
            }
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <label htmlFor="dictionary-replacement-mode" className="block text-sm font-medium">
                  It is a replacement
                </label>
                <TypographyMuted className="text-xs">
                  Turn this on to add a word replacement pair instead of a hotword.
                </TypographyMuted>
              </div>
              <Switch
                id="dictionary-replacement-mode"
                checked={draft.isReplacement}
                onCheckedChange={(checked) =>
                  onDraftChange({
                    ...draft,
                    isReplacement: checked
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="dictionary-term" className="block text-sm font-medium">
              {isReplacement ? 'Word' : 'Hotword'}
            </label>
            <Input
              id="dictionary-term"
              value={draft.term}
              placeholder={
                isReplacement ? 'Enter the original word or phrase' : 'Enter a word or phrase'
              }
              onChange={(event) => onDraftChange({ ...draft, term: event.target.value })}
            />
          </div>
          {isReplacement ? (
            <div className="space-y-2">
              <label htmlFor="dictionary-replacement" className="block text-sm font-medium">
                Replacement
              </label>
              <Input
                id="dictionary-replacement"
                value={draft.replacement}
                placeholder="Enter the replacement text"
                onChange={(event) => onDraftChange({ ...draft, replacement: event.target.value })}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="dictionary-note" className="block text-sm font-medium">
              Note
            </label>
            <Textarea
              id="dictionary-note"
              value={draft.note}
              placeholder="Optional context, pronunciation, or example"
              onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DictionaryRow({
  entry,
  isLast,
  onEdit,
  onDelete
}: {
  entry: DictionaryEntry
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const entryType = getEntryType(entry)
  const isReplacement = entryType === 'replacement' && Boolean(entry.replacement)

  return (
    <>
      <div className="px-4 py-3 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <TypographySmall>{entry.term}</TypographySmall>
                {isReplacement ? (
                  <>
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      strokeWidth={2}
                      size={16}
                      className="shrink-0"
                    />
                    <TypographySmall>{entry.replacement}</TypographySmall>
                  </>
                ) : null}
              </div>
            </div>
            {entry.note ? (
              <TypographyMuted className="mt-1 text-xs">{entry.note}</TypographyMuted>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-center">
            <Button variant="ghost" size="icon-sm" className="gap-1.5" onClick={onEdit}>
              <HugeiconsIcon icon={Pen01Icon} size={14} />
            </Button>
            <Button variant="ghost" size="icon-sm" className="gap-1.5" onClick={onDelete}>
              <HugeiconsIcon icon={Delete02Icon} size={14} />
            </Button>
          </div>
        </div>
      </div>
      {!isLast && <Separator />}
    </>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty className="min-h-90 flex-1 rounded-xl border border-dashed border-foreground/15 bg-muted/20">
      <EmptyHeader>
        <EmptyTitle>Your dictionary is empty</EmptyTitle>
        <EmptyDescription>Add hotwords or replacements.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAdd}>Create my first entry</Button>
      </EmptyContent>
    </Empty>
  )
}

function persistEntries(
  replace: (data: DictionarySettings) => Promise<void>,
  entries: DictionaryEntry[]
) {
  return replace({ entries })
}

export const Dictionary: React.FC = () => {
  const { data, isHydrated, replace } = useStore(dictionaryStore)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DictionaryDraft>(EMPTY_DRAFT)

  const entries = useMemo(
    () =>
      [...data.entries].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [data.entries]
  )

  const resetEditor = () => {
    setIsCreating(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  const startCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setIsCreating(true)
  }

  const startEdit = (entry: DictionaryEntry) => {
    setIsCreating(false)
    setEditingId(entry.id)
    setDraft(toDraft(entry))
  }

  const saveCreate = async () => {
    const nextEntry = createDictionaryEntry(draft)
    await persistEntries(replace, [...entries, nextEntry])
    resetEditor()
  }

  const saveEdit = async (entry: DictionaryEntry) => {
    const nextEntries = entries.map((item) =>
      item.id === entry.id ? updateDictionaryEntry(item, draft) : item
    )

    await persistEntries(replace, nextEntries)
    resetEditor()
  }

  const removeEntry = async (entryId: string) => {
    await persistEntries(
      replace,
      entries.filter((entry) => entry.id !== entryId)
    )

    if (editingId === entryId) {
      resetEditor()
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TypographyH3 className="text-left">Dictionary</TypographyH3>
          <TypographyMuted className="not-first:mt-2">
            Manage your hotwords and replacements, keep notes with them, and track a local usage
            count for each entry.
          </TypographyMuted>
        </div>
        <Button className="shrink-0 self-center" onClick={startCreate}>
          Add
        </Button>
      </div>

      {!isHydrated ? (
        <TypographyMuted>Loading dictionary...</TypographyMuted>
      ) : (
        <section className="flex flex-1 flex-col space-y-3">
          {entries.length === 0 ? (
            <EmptyState onAdd={startCreate} />
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              {entries.map((entry, index) => (
                <DictionaryRow
                  key={entry.id}
                  entry={entry}
                  isLast={index === entries.length - 1}
                  onEdit={() => startEdit(entry)}
                  onDelete={() => void removeEntry(entry.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <DictionaryEditor
        mode="create"
        open={isCreating}
        draft={draft}
        onDraftChange={setDraft}
        onOpenChange={(open) => {
          if (!open) {
            resetEditor()
          }
        }}
        onSubmit={saveCreate}
        submitLabel="Save"
      />

      <DictionaryEditor
        mode="edit"
        open={editingId !== null}
        draft={draft}
        onDraftChange={setDraft}
        onOpenChange={(open) => {
          if (!open) {
            resetEditor()
          }
        }}
        onSubmit={() => {
          const currentEntry = entries.find((entry) => entry.id === editingId)
          if (currentEntry) {
            void saveEdit(currentEntry)
          }
        }}
        submitLabel="Save"
      />
    </div>
  )
}
