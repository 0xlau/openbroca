import React, { useMemo, useState } from 'react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Badge,
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
  note: string
}

const EMPTY_DRAFT: DictionaryDraft = {
  term: '',
  note: ''
}

function createEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `hotword-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toDraft(entry?: DictionaryEntry): DictionaryDraft {
  return {
    term: entry?.term ?? '',
    note: entry?.note ?? ''
  }
}

function createDictionaryEntry(draft: DictionaryDraft): DictionaryEntry {
  const now = new Date().toISOString()

  return {
    id: createEntryId(),
    term: draft.term.trim(),
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
    note: draft.note.trim() || undefined,
    updatedAt: new Date().toISOString()
  }
}

function DictionaryEditor({
  title,
  description,
  open,
  draft,
  onDraftChange,
  onOpenChange,
  onSubmit,
  submitLabel
}: {
  title: string
  description: string
  open: boolean
  draft: DictionaryDraft
  onDraftChange: (draft: DictionaryDraft) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  submitLabel: string
}) {
  const term = draft.term.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!term) {
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
            <label htmlFor="dictionary-term" className="block text-sm font-medium">
              Hotword
            </label>
            <Input
              id="dictionary-term"
              value={draft.term}
              placeholder="Enter a word or phrase"
              onChange={(event) => onDraftChange({ ...draft, term: event.target.value })}
            />
          </div>
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
            <Button type="submit" size="sm" disabled={!term}>
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
  return (
    <>
      <div className="px-4 py-3 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <TypographySmall>{entry.term}</TypographySmall>
              <Badge variant="secondary" className="text-xs">
                Used {entry.usageCount} times
              </Badge>
            </div>
            {entry.note ? (
              <TypographyMuted className="mt-1 text-xs">{entry.note}</TypographyMuted>
            ) : (
              <TypographyMuted className="mt-1 text-xs">
                No note yet. Add context to help future you recognize this hotword.
              </TypographyMuted>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-center">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
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
        <EmptyDescription>
          Add product names, people, or domain terms you want to keep visible in one place.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAdd}>Create my first hotword</Button>
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
            Manage your hotwords, keep notes with them, and track a local usage count for each
            entry.
          </TypographyMuted>
        </div>
        <Button className="shrink-0 self-center" onClick={startCreate}>
          Add Hotword
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
        title="Add Hotword"
        description="Hotwords are stored locally and their usage count starts at zero."
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
        title="Edit Hotword"
        description="Update the term or note without changing the current usage count."
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
