# Typeless Prompt Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop dictation cleanup prompt with a tested prompt builder that incorporates dictionary and `About Me` context conservatively.

**Architecture:** Add shared normalization helpers for `dictionary` and `aboutMe`, then build a main-process prompt composer that serializes those settings into a layered system prompt. Wire the prompt composer into `PostRecordingPipeline` through injected getters so the pipeline stays focused on orchestration and tests can validate prompt composition independently.

**Tech Stack:** Electron, TypeScript, Vitest, electron-store

---

## File Structure

### New Files

- `apps/desktop/src/shared/about-me.ts`
  Exposes `AboutMeSettings`, `defaultAboutMeSettings`, and `normalizeAboutMeSettings`.
- `apps/desktop/src/shared/dictionary.ts`
  Exposes `DictionaryEntry`, `DictionarySettings`, `defaultDictionarySettings`, and `normalizeDictionarySettings`.
- `apps/desktop/src/main/cleanup-prompt.ts`
  Builds the layered cleanup system prompt and serializes dictionary and `About Me`.
- `apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
  Covers prompt composition behavior independently from pipeline orchestration.

### Modified Files

- `apps/desktop/src/renderer/src/stores/about-me-store.ts`
  Reuse shared `AboutMe` types/defaults instead of maintaining a duplicate shape.
- `apps/desktop/src/renderer/src/stores/dictionary-store.ts`
  Reuse shared dictionary types/defaults instead of maintaining a duplicate shape.
- `apps/desktop/src/main/trpc/routers/store.ts`
  Normalize `aboutMe` and `dictionary` writes so persisted data stays predictable.
- `apps/desktop/src/main/index.ts`
  Inject normalized store-backed getters for `aboutMe` and `dictionary` into the pipeline.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Replace inline prompt assembly with `buildCleanupSystemPrompt`.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Update existing assertions and add pipeline-level coverage for the new context blocks.

## Task 1: Add Shared Settings Normalizers

**Files:**
- Create: `apps/desktop/src/shared/about-me.ts`
- Create: `apps/desktop/src/shared/dictionary.ts`
- Modify: `apps/desktop/src/renderer/src/stores/about-me-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/dictionary-store.ts`
- Modify: `apps/desktop/src/main/trpc/routers/store.ts`

- [ ] **Step 1: Write the failing normalization tests inside the prompt-builder test file**

```ts
import { describe, expect, test } from 'vitest'
import { normalizeAboutMeSettings } from '../../shared/about-me'
import { normalizeDictionarySettings } from '../../shared/dictionary'

describe('shared settings normalization', () => {
  test('normalizes about me fields to trimmed strings', () => {
    expect(
      normalizeAboutMeSettings({
        nickname: '  Peiqiang  ',
        email: 42,
        occupation: ' Engineer ',
        bio: null
      })
    ).toEqual({
      nickname: 'Peiqiang',
      email: '',
      occupation: 'Engineer',
      bio: ''
    })
  })

  test('drops invalid dictionary entries and trims valid values', () => {
    expect(
      normalizeDictionarySettings({
        entries: [
          { id: '1', term: ' Typeless ', type: 'hotword', usageCount: 3 },
          { id: '2', term: ' ', replacement: 'OpenBroca', usageCount: 1 },
          { id: '3', term: 'open broca', replacement: ' OpenBroca ', usageCount: 2 }
        ]
      })
    ).toEqual({
      entries: [
        expect.objectContaining({
          id: '1',
          term: 'Typeless',
          type: 'hotword'
        }),
        expect.objectContaining({
          id: '3',
          term: 'open broca',
          replacement: 'OpenBroca'
        })
      ]
    })
  })
})
```

- [ ] **Step 2: Run the tests to confirm the helpers do not exist yet**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
Expected: FAIL with module resolution errors for `../../shared/about-me` and `../../shared/dictionary`

- [ ] **Step 3: Implement shared `About Me` normalization**

```ts
function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export interface AboutMeSettings {
  nickname: string
  email: string
  occupation: string
  bio: string
}

export const defaultAboutMeSettings: AboutMeSettings = {
  nickname: '',
  email: '',
  occupation: '',
  bio: ''
}

export function normalizeAboutMeSettings(raw: unknown): AboutMeSettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  return {
    nickname: normalizeString(record.nickname),
    email: normalizeString(record.email),
    occupation: normalizeString(record.occupation),
    bio: normalizeString(record.bio)
  }
}
```

- [ ] **Step 4: Implement shared dictionary normalization**

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface DictionaryEntry {
  id: string
  term: string
  type?: 'hotword' | 'replacement'
  replacement?: string
  note?: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface DictionarySettings {
  entries: DictionaryEntry[]
}

export const defaultDictionarySettings: DictionarySettings = {
  entries: []
}

export function normalizeDictionarySettings(raw: unknown): DictionarySettings {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    return defaultDictionarySettings
  }

  const entries = raw.entries.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return []
    }

    const term = typeof candidate.term === 'string' ? candidate.term.trim() : ''
    if (!term) {
      return []
    }

    const replacement =
      typeof candidate.replacement === 'string' ? candidate.replacement.trim() : undefined
    const type =
      candidate.type === 'hotword' || candidate.type === 'replacement' ? candidate.type : undefined

    return [
      {
        id: typeof candidate.id === 'string' ? candidate.id : '',
        term,
        type,
        replacement: replacement || undefined,
        note: typeof candidate.note === 'string' ? candidate.note.trim() || undefined : undefined,
        usageCount: typeof candidate.usageCount === 'number' ? candidate.usageCount : 0,
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : ''
      }
    ]
  })

  return { entries }
}
```

- [ ] **Step 5: Repoint renderer stores and normalize store writes**

```ts
import {
  defaultAboutMeSettings,
  type AboutMeSettings
} from '../../../shared/about-me'

export const aboutMeStore = createPersistedStore<AboutMeSettings>({
  key: 'aboutMe',
  defaults: defaultAboutMeSettings
})
```

```ts
import {
  defaultDictionarySettings,
  type DictionaryEntry,
  type DictionarySettings
} from '../../../shared/dictionary'

export const dictionaryStore = createPersistedStore<DictionarySettings>({
  key: 'dictionary',
  defaults: defaultDictionarySettings
})
```

```ts
import { normalizeAboutMeSettings } from '../../../shared/about-me'
import { normalizeDictionarySettings } from '../../../shared/dictionary'

function normalizeStoreValue(key: AllowedStoreKey, value: unknown): unknown {
  if (key === 'instructions') {
    return normalizeInstructionsSettings(value)
  }

  if (key === 'aboutMe') {
    return normalizeAboutMeSettings(value)
  }

  if (key === 'dictionary') {
    return normalizeDictionarySettings(value)
  }

  return value
}
```

- [ ] **Step 6: Run the tests to verify normalization passes**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
Expected: PASS for the shared normalization tests

- [ ] **Step 7: Commit the normalization groundwork**

```bash
git add apps/desktop/src/shared/about-me.ts apps/desktop/src/shared/dictionary.ts apps/desktop/src/renderer/src/stores/about-me-store.ts apps/desktop/src/renderer/src/stores/dictionary-store.ts apps/desktop/src/main/trpc/routers/store.ts apps/desktop/src/main/__tests__/cleanup-prompt.test.ts
git commit -m "refactor: normalize about me and dictionary settings"
```

## Task 2: Add the Cleanup Prompt Builder

**Files:**
- Create: `apps/desktop/src/main/cleanup-prompt.ts`
- Modify: `apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`

- [ ] **Step 1: Write failing prompt-builder tests for empty and populated context**

```ts
import { buildCleanupSystemPrompt } from '../cleanup-prompt'

describe('buildCleanupSystemPrompt', () => {
  test('renders None blocks when dictionary and about me are empty', () => {
    expect(
      buildCleanupSystemPrompt({
        dictionary: { entries: [] },
        aboutMe: { nickname: '', email: '', occupation: '', bio: '' }
      })
    ).toContain('Dictionary:\nNone.')
  })

  test('serializes hotwords, replacements, notes, and matched instructions', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: {
        entries: [
          {
            id: '1',
            term: 'Typeless',
            type: 'hotword',
            note: 'product name, preserve exact casing',
            usageCount: 9,
            createdAt: '',
            updatedAt: '2026-04-17T10:00:00.000Z'
          },
          {
            id: '2',
            term: 'open broca',
            type: 'replacement',
            replacement: 'OpenBroca',
            usageCount: 3,
            createdAt: '',
            updatedAt: '2026-04-17T09:00:00.000Z'
          }
        ]
      },
      aboutMe: {
        nickname: 'Peiqiang',
        email: 'liupeiqiang@example.com',
        occupation: 'Software Engineer',
        bio: 'Builds AI and voice tools'
      },
      matchedInstructionText: 'Use short chat-style replies.'
    })

    expect(prompt).toContain('hotword:\n- Typeless')
    expect(prompt).toContain('replacement:\n- open broca => OpenBroca')
    expect(prompt).toContain('notes:\n- Typeless: product name, preserve exact casing')
    expect(prompt).toContain('nickname: Peiqiang')
    expect(prompt).toContain('Matched app instructions:\nUse short chat-style replies.')
  })
})
```

- [ ] **Step 2: Run the test to verify the builder is not implemented**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
Expected: FAIL with `Cannot find module '../cleanup-prompt'`

- [ ] **Step 3: Implement prompt serialization helpers**

```ts
function renderNoneWhenEmpty(lines: string[]): string {
  return lines.length > 0 ? lines.join('\n') : 'None.'
}

function serializeDictionary(settings: DictionarySettings): string {
  const entries = [...settings.entries].sort((left, right) => {
    if (right.usageCount !== left.usageCount) {
      return right.usageCount - left.usageCount
    }

    return right.updatedAt.localeCompare(left.updatedAt)
  })

  const hotwords = entries.filter((entry) => (entry.type ?? 'hotword') === 'hotword')
  const replacements = entries.filter(
    (entry) => (entry.type === 'replacement' || (!entry.type && entry.replacement)) && entry.replacement
  )

  const lines: string[] = []

  if (hotwords.length > 0) {
    lines.push('hotword:', ...hotwords.map((entry) => `- ${entry.term}`), '')
  }

  if (replacements.length > 0) {
    lines.push(
      'replacement:',
      ...replacements.map((entry) => `- ${entry.term} => ${entry.replacement}`),
      ''
    )
  }

  const notes = entries.filter((entry) => entry.note)
  if (notes.length > 0) {
    lines.push('notes:', ...notes.map((entry) => `- ${entry.term}: ${entry.note}`))
  }

  return renderNoneWhenEmpty(lines.filter((line, index, all) => !(line === '' && index === all.length - 1)))
}

function serializeAboutMe(settings: AboutMeSettings): string {
  const lines = [
    settings.nickname ? `nickname: ${settings.nickname}` : null,
    settings.email ? `email: ${settings.email}` : null,
    settings.occupation ? `occupation: ${settings.occupation}` : null,
    settings.bio ? `bio: ${settings.bio}` : null
  ].filter((line): line is string => line !== null)

  return renderNoneWhenEmpty(lines)
}
```

- [ ] **Step 4: Implement the final prompt builder**

```ts
export type CleanupPromptContext = {
  dictionary: DictionarySettings
  aboutMe: AboutMeSettings
  matchedInstructionText?: string | null
}

export function buildCleanupSystemPrompt(context: CleanupPromptContext): string {
  const matchedInstructionText = context.matchedInstructionText?.trim()

  return [
    'You are a post-processing editor for dictated text.',
    '',
    'Your job is to convert a raw voice transcript into polished final text.',
    '',
    'Primary goal:',
    "- Preserve the user's original meaning exactly.",
    '- Clean up speech recognition noise, filler fragments, punctuation, capitalization, and obvious transcription mistakes.',
    '- Do not add new ideas, claims, intent, or stylistic flourishes.',
    '',
    'Output principles:',
    '- Keep the wording as close as possible to what the user actually said.',
    '- Improve readability, but do not rewrite aggressively.',
    '- If the original speech is naturally list-like, step-based, or clearly easier to read as bullets or short structure, you may format it structurally.',
    '- Otherwise, keep it as normal prose.',
    '- Never force bullet points, headings, or sections when the content does not call for them.',
    '',
    'Dictionary rules:',
    '- Treat the following dictionary as canonical terminology guidance.',
    '- If a transcript word or phrase is clearly intended to match a dictionary term, normalize it to the canonical form.',
    '- For replacement entries, prefer the replacement value when the spoken content clearly refers to that term.',
    '- For hotword entries, preserve the canonical spelling exactly.',
    '- Do not apply dictionary replacements blindly when the meaning does not match.',
    '- If a dictionary note helps disambiguate a term, use it conservatively.',
    '',
    'User facts:',
    '- The following profile is only for factual alignment.',
    '- Use it only to correct or stabilize identity-related details when the transcript clearly refers to the user.',
    '- Do not inject profile facts that were never implied by the transcript.',
    '- Do not use the profile to change tone, style, or personality.',
    '',
    'Hard constraints:',
    '- Do not change the user\\'s intent.',
    '- Do not make the text more formal, more friendly, or more expressive unless that is already present.',
    '- Do not summarize.',
    '- Do not expand shorthand into extra explanation unless necessary for clarity.',
    '- Do not invent names, titles, links, dates, or contact details.',
    '- Output only the final cleaned text, with no commentary.',
    '',
    'Dictionary:',
    serializeDictionary(context.dictionary),
    '',
    'About the user:',
    serializeAboutMe(context.aboutMe),
    ...(matchedInstructionText ? ['', 'Matched app instructions:', matchedInstructionText] : [])
  ].join('\n')
}
```

- [ ] **Step 5: Run the prompt-builder tests**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the prompt builder**

```bash
git add apps/desktop/src/main/cleanup-prompt.ts apps/desktop/src/main/__tests__/cleanup-prompt.test.ts
git commit -m "feat: add dictation cleanup prompt builder"
```

## Task 3: Wire the Prompt Builder Into the Pipeline

**Files:**
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Write failing pipeline tests for dictionary and `About Me` prompt context**

```ts
test('includes normalized dictionary and about me blocks in the system prompt', async () => {
  const llmProvider = {
    id: 'openai-codex',
    displayName: 'OpenAI Codex',
    isConfigured: () => true,
    listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
    generate: vi.fn().mockResolvedValue({
      content: 'Typeless by Peiqiang',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 }
    })
  }

  const pipeline = new PostRecordingPipeline({
    historyRepository: repository as never,
    recordingStorage: storage as never,
    resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
    resolveActiveLLMSelection: vi
      .fn()
      .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
    getDictionarySettings: () => ({
      entries: [
        {
          id: '1',
          term: 'Typeless',
          type: 'hotword',
          usageCount: 1,
          createdAt: '',
          updatedAt: '2026-04-17T10:00:00.000Z'
        }
      ]
    }),
    getAboutMeSettings: () => ({
      nickname: 'Peiqiang',
      email: '',
      occupation: 'Engineer',
      bio: ''
    })
  } as never)

  await pipeline.process(recording)

  const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
  expect(llmRequest?.messages[0]?.content).toContain('hotword:\n- Typeless')
  expect(llmRequest?.messages[0]?.content).toContain('nickname: Peiqiang')
})
```

- [ ] **Step 2: Run the pipeline test target to confirm the new dependencies are missing**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
Expected: FAIL because `PostRecordingPipeline` does not accept `getDictionarySettings` and `getAboutMeSettings`

- [ ] **Step 3: Inject normalized settings getters from `index.ts`**

```ts
import { normalizeAboutMeSettings } from '../shared/about-me'
import { normalizeDictionarySettings } from '../shared/dictionary'

const postRecordingPipeline = new PostRecordingPipeline({
  historyRepository,
  recordingStorage,
  resolveActiveASRSelection: () =>
    resolveActiveASRSelection({
      asrRegistry,
      store
    }),
  resolveActiveLLMSelection: () =>
    resolveActiveLLMSelection({
      llmRegistry,
      oauthService,
      store
    }),
  getDictionarySettings: () => normalizeDictionarySettings(store.get('dictionary')),
  getAboutMeSettings: () => normalizeAboutMeSettings(store.get('aboutMe')),
  resolveMatchedInstruction,
  autoEnterService
})
```

- [ ] **Step 4: Replace inline prompt assembly inside the pipeline**

```ts
import type { AboutMeSettings } from '../shared/about-me'
import type { DictionarySettings } from '../shared/dictionary'
import { buildCleanupSystemPrompt } from './cleanup-prompt'

export class PostRecordingPipeline {
  constructor(
    private readonly deps: {
      historyRepository: HistoryRepository
      recordingStorage: RecordingStorage
      resolveActiveASRSelection: () => Promise<...>
      resolveActiveLLMSelection: () => Promise<...>
      getDictionarySettings?: () => DictionarySettings
      getAboutMeSettings?: () => AboutMeSettings
      resolveMatchedInstruction?: (...)
      autoEnterService?: AutoEnterService
    }
  ) {}
}
```

```ts
const systemPrompt = buildCleanupSystemPrompt({
  dictionary: this.deps.getDictionarySettings?.() ?? { entries: [] },
  aboutMe:
    this.deps.getAboutMeSettings?.() ?? {
      nickname: '',
      email: '',
      occupation: '',
      bio: ''
    },
  matchedInstructionText: matchedInstruction?.customInstructions ?? null
})
```

- [ ] **Step 5: Update pipeline assertions to match the new prompt**

```ts
expect(llmRequest?.messages[0]?.content).toContain(
  'You are a post-processing editor for dictated text.'
)
expect(llmRequest?.messages[0]?.content).toContain('Matched app instructions:\nUse short chat-style replies.')
expect(llmRequest?.messages[0]?.content).toContain('Dictionary:\nNone.')
expect(llmRequest?.messages[0]?.content).toContain('About the user:\nNone.')
```

- [ ] **Step 6: Run the focused tests**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
Expected: PASS

- [ ] **Step 7: Run the desktop Vitest suite that covers the touched files**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/renderer/src/pages/main/__tests__/about-me.test.tsx apps/desktop/src/renderer/src/pages/main/__tests__/dictionary.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit the integration**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/main/post-recording-pipeline.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/main/cleanup-prompt.ts apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/shared/about-me.ts apps/desktop/src/shared/dictionary.ts apps/desktop/src/main/trpc/routers/store.ts apps/desktop/src/renderer/src/stores/about-me-store.ts apps/desktop/src/renderer/src/stores/dictionary-store.ts
git commit -m "feat: use typeless-style prompt composition"
```

## Self-Review

### Spec Coverage

- layered prompt structure: covered by Task 2
- dictionary serialization rules: covered by Task 2
- `About Me` factual alignment rules: covered by Task 2
- prompt builder extraction from pipeline: covered by Task 3
- matched instruction ordering: covered by Task 2 and Task 3
- normalization of persisted settings before prompt usage: covered by Task 1 and Task 3
- prompt and pipeline tests: covered by Task 1, Task 2, and Task 3

### Placeholder Scan

- no unresolved placeholder markers or deferred implementation notes remain
- each code-changing step includes an explicit code block
- each validation step includes an exact command and expected result

### Type Consistency

- `AboutMeSettings` is defined once in `apps/desktop/src/shared/about-me.ts`
- `DictionarySettings` is defined once in `apps/desktop/src/shared/dictionary.ts`
- `buildCleanupSystemPrompt` consumes normalized settings in both unit tests and pipeline integration
