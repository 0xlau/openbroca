# Prompts Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Settings > Prompts` page that lets users edit the full LLM system prompt template, insert placeholders, restore the default template, and have the main-process cleanup pipeline resolve known placeholders while turning unknown or future ones into empty strings.

**Architecture:** Split the work into three layers. First, add a shared prompt-template module plus persistence normalization so UI and runtime share one source of truth for the default template and placeholder catalog. Second, add the renderer store, route, sidebar item, and `Prompts` page with textarea editing plus click-to-insert placeholder reference. Third, integrate runtime template resolution into the existing cleanup-prompt / post-recording pipeline path without changing the higher-level send flow.

**Tech Stack:** Electron, React, React Router, Zustand, TanStack Form, TypeScript, Vitest, TRPC, electron-store

---

## File Structure

### New Files

- `apps/desktop/src/shared/prompt-template.ts`
  Shared source of truth for `PromptTemplateSettings`, default template text, placeholder definitions, settings normalization, and runtime placeholder resolution.
- `apps/desktop/src/renderer/src/stores/prompts-store.ts`
  Persisted renderer store for the saved prompt template.
- `apps/desktop/src/renderer/src/stores/__tests__/prompts-store.test.ts`
  Tests hydrate/watch normalization for the new prompts store.
- `apps/desktop/src/renderer/src/pages/main/prompts.tsx`
  The `Prompts` page with textarea editor, `Use default template`, dirty-state save behavior, and click-to-insert placeholder reference.
- `apps/desktop/src/renderer/src/pages/main/__tests__/prompts.test.tsx`
  Page-level tests for save visibility, default reset, and placeholder insertion.

### Modified Files

- `apps/desktop/src/main/store/schema.ts`
  Adds the `prompts` store slot to the desktop store schema.
- `apps/desktop/src/main/store/instance.ts`
  Registers the default persisted value for `prompts`.
- `apps/desktop/src/main/trpc/routers/store.ts`
  Allows and normalizes `prompts` writes.
- `apps/desktop/src/main/trpc/routers/__tests__/store.test.ts`
  Covers `prompts` normalization in the generic store router.
- `apps/desktop/src/renderer/src/components/nav-settings.tsx`
  Adds the `Prompts` menu item under `Providers`.
- `apps/desktop/src/renderer/src/router/index.tsx`
  Registers the `/prompts` route.
- `apps/desktop/src/main/cleanup-prompt.ts`
  Stops hardcoding the prompt template text and instead resolves a template string against runtime context.
- `apps/desktop/src/main/post-recording-pipeline.ts`
  Accepts prompt-template settings in prompt context getters and passes them into cleanup prompt resolution.
- `apps/desktop/src/main/index.ts`
  Injects normalized `prompts` settings into the pipeline wiring.
- `apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
  Adds unit tests for template resolution and unknown/future placeholder behavior.
- `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
  Verifies pipeline uses the saved template and unknown placeholders collapse to empty strings.

## Task 1: Add Shared Prompt Template Core And Persistence Plumbing

**Files:**
- Create: `apps/desktop/src/shared/prompt-template.ts`
- Create: `apps/desktop/src/renderer/src/stores/prompts-store.ts`
- Create: `apps/desktop/src/renderer/src/stores/__tests__/prompts-store.test.ts`
- Modify: `apps/desktop/src/main/store/schema.ts`
- Modify: `apps/desktop/src/main/store/instance.ts`
- Modify: `apps/desktop/src/main/trpc/routers/store.ts`
- Modify: `apps/desktop/src/main/trpc/routers/__tests__/store.test.ts`

- [ ] **Step 1: Write the failing shared/store tests first**

```ts
import { describe, expect, test, vi } from 'vitest'
import {
  defaultPromptTemplateSettings,
  normalizePromptTemplateSettings,
  promptPlaceholderDefinitions,
  defaultCleanupPromptTemplate
} from '../../shared/prompt-template'

describe('prompt-template shared settings', () => {
  test('normalizes non-string template values to an empty template', () => {
    expect(normalizePromptTemplateSettings({ template: 42 })).toEqual({
      template: ''
    })
  })

  test('exports a non-empty default template and grouped placeholder catalog', () => {
    expect(defaultCleanupPromptTemplate).toContain('You are a post-processing editor for dictated text.')
    expect(promptPlaceholderDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: '{{dictionary}}', category: 'available' }),
        expect.objectContaining({ token: '{{about_me.nickname}}', category: 'available' }),
        expect.objectContaining({ token: '{{raw_transcript}}', category: 'planned' })
      ])
    )
  })
})
```

```ts
test('normalizes malformed prompts payloads on write', async () => {
  const store = new MemoryStore()
  const caller = storeRouter.createCaller({ store } as unknown as Context)

  await caller.set({
    key: 'prompts',
    value: {
      template: 99
    }
  })

  await expect(caller.get({ key: 'prompts' })).resolves.toEqual({
    template: ''
  })
})
```

```ts
test('normalizes malformed persisted prompt template values during hydration', async () => {
  storeGetQueryMock.mockResolvedValue(null)
  storeWatchSubscribeMock.mockReturnValue({ unsubscribe: vi.fn() })

  const { promptsStore } = await import('../prompts-store')
  await promptsStore.getState().hydrate()

  storeGetQueryMock.mockClear()
  storeGetQueryMock.mockResolvedValueOnce({ template: 123 })

  await promptsStore.getState().hydrate()

  expect(promptsStore.getState().data).toEqual({ template: '' })
})
```

- [ ] **Step 2: Run the tests to verify they fail for the right reason**

Run: `pnpm vitest run apps/desktop/src/main/trpc/routers/__tests__/store.test.ts apps/desktop/src/renderer/src/stores/__tests__/prompts-store.test.ts`
Expected: FAIL because `prompt-template.ts` and `prompts-store.ts` do not exist yet and `prompts` is not an allowed store key.

- [ ] **Step 3: Implement the shared prompt-template module**

```ts
export type PromptTemplateSettings = {
  template: string
}

export const defaultPromptTemplateSettings: PromptTemplateSettings = {
  template: ''
}

export type PromptPlaceholderCategory = 'available' | 'planned'

export type PromptPlaceholderDefinition = {
  key: string
  token: string
  description: string
  category: PromptPlaceholderCategory
}

export const promptPlaceholderDefinitions: PromptPlaceholderDefinition[] = [
  {
    key: 'dictionary',
    token: '{{dictionary}}',
    description: 'Full serialized dictionary block',
    category: 'available'
  },
  {
    key: 'about_me.nickname',
    token: '{{about_me.nickname}}',
    description: 'User nickname',
    category: 'available'
  },
  {
    key: 'raw_transcript',
    token: '{{raw_transcript}}',
    description: 'Planned future raw transcript placeholder',
    category: 'planned'
  }
]

export const defaultCleanupPromptTemplate = `You are a post-processing editor for dictated text.

Your job is to convert a raw voice transcript into polished final text.

Primary goal:
- Preserve the user's original meaning exactly.
- Clean up speech recognition noise, filler fragments, punctuation, capitalization, and obvious transcription mistakes.
- Do not add new ideas, claims, intent, or stylistic flourishes.

Output principles:
- Keep the wording as close as possible to what the user actually said.
- Improve readability, but do not rewrite aggressively.
- If the original speech is naturally list-like, step-based, or clearly easier to read as bullets or short structure, you may format it structurally.
- Otherwise, keep it as normal prose.
- Never force bullet points, headings, or sections when the content does not call for them.

Dictionary:
{{dictionary}}

About the user:
{{about_me}}

Matched app instructions:
{{matched_instructions}}`

export function normalizePromptTemplateSettings(raw: unknown): PromptTemplateSettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  return {
    template: typeof record.template === 'string' ? record.template : ''
  }
}
```

- [ ] **Step 4: Implement the prompts store and persistence plumbing**

```ts
import { createPersistedStore } from './create-persisted-store'
import {
  defaultPromptTemplateSettings,
  normalizePromptTemplateSettings,
  type PromptTemplateSettings
} from '../../../shared/prompt-template'

export { defaultPromptTemplateSettings }
export type { PromptTemplateSettings }

export const promptsStore = createPersistedStore<PromptTemplateSettings>({
  key: 'prompts',
  defaults: defaultPromptTemplateSettings,
  normalize: normalizePromptTemplateSettings
})
```

```ts
export interface StoreSchema {
  aboutMe: Record<string, unknown>
  dictionary: Record<string, unknown>
  prompts: Record<string, unknown>
  instructions: InstructionsSettings
  providers: ProviderSettings
  settings: Record<string, unknown>
  voiceHistory: VoiceHistoryState
  [key: string]: unknown
}
```

```ts
defaults: {
  aboutMe: {},
  dictionary: {},
  prompts: defaultPromptTemplateSettings,
  instructions: defaultInstructionsSettings,
  providers: defaultProviderSettings,
  settings: {},
  voiceHistory: defaultVoiceHistoryState
}
```

```ts
const allowedStoreKeys = [
  'aboutMe',
  'dictionary',
  'prompts',
  'instructions',
  'providers',
  'settings',
  'microphone',
  'shortcuts'
] as const

function normalizeStoreValue(key: AllowedStoreKey, value: unknown): unknown {
  if (key === 'prompts') {
    return normalizePromptTemplateSettings(value)
  }

  // existing aboutMe/dictionary/instructions branches remain
}
```

- [ ] **Step 5: Add store hydration/write tests**

```ts
test('normalizes external prompt template updates from store watch events', async () => {
  storeGetQueryMock.mockResolvedValue(null)

  let onData: ((newValue: unknown) => void) | undefined
  storeWatchSubscribeMock.mockImplementation((_input, opts) => {
    onData = opts.onData
    return { unsubscribe: vi.fn() }
  })

  const { promptsStore } = await import('../prompts-store')
  await promptsStore.getState().hydrate()

  onData?.({ template: 999 })

  expect(promptsStore.getState().data).toEqual({ template: '' })
})
```

- [ ] **Step 6: Run the tests to verify Task 1 passes**

Run: `pnpm vitest run apps/desktop/src/main/trpc/routers/__tests__/store.test.ts apps/desktop/src/renderer/src/stores/__tests__/prompts-store.test.ts`
Expected: PASS

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/desktop/src/shared/prompt-template.ts apps/desktop/src/renderer/src/stores/prompts-store.ts apps/desktop/src/renderer/src/stores/__tests__/prompts-store.test.ts apps/desktop/src/main/store/schema.ts apps/desktop/src/main/store/instance.ts apps/desktop/src/main/trpc/routers/store.ts apps/desktop/src/main/trpc/routers/__tests__/store.test.ts
git commit -m "feat: add prompt template settings plumbing"
```

## Task 2: Add The Prompts Route, Navigation, And Editor Page

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/main/prompts.tsx`
- Create: `apps/desktop/src/renderer/src/pages/main/__tests__/prompts.test.tsx`
- Modify: `apps/desktop/src/renderer/src/components/nav-settings.tsx`
- Modify: `apps/desktop/src/renderer/src/router/index.tsx`
- Modify: `apps/desktop/src/renderer/src/stores/prompts-store.ts`

- [ ] **Step 1: Write the failing Prompts page tests**

```tsx
// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'
import type { PersistedStoreState } from '@renderer/stores/create-persisted-store'

type PromptTemplateState = {
  template: string
}

let promptsStoreMock: ReturnType<typeof createMockStore>

function createMockStore(data: PromptTemplateState) {
  return createStore<PersistedStoreState<PromptTemplateState>>((set, get) => ({
    data,
    isHydrated: true,
    update: vi.fn(async (partial) => {
      set({ data: { ...get().data, ...partial } })
    }),
    replace: vi.fn(async (nextData) => {
      set({ data: nextData })
    }),
    hydrate: vi.fn(async () => {})
  }))
}

vi.mock('@renderer/stores/prompts-store', () => ({
  defaultPromptTemplateSettings: { template: '' },
  get promptsStore() {
    return promptsStoreMock
  }
}))

describe('Prompts', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()
    promptsStoreMock = createMockStore({
      template: 'Custom template {{about_me.nickname}}'
    })
  })

  test('shows save changes only after textarea edits', async () => {
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Prompt template'), {
      target: { value: 'Edited template' }
    })

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  test('clicking a placeholder inserts it into the textarea', async () => {
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    const textarea = screen.getByLabelText('Prompt template') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(0, 0)

    fireEvent.click(screen.getByRole('button', { name: '{{about_me.nickname}}' }))

    expect(textarea.value.startsWith('{{about_me.nickname}}')).toBe(true)
  })

  test('use default template resets the editor to the shared default', async () => {
    const { Prompts } = await import('../prompts')

    render(<Prompts />)

    fireEvent.click(screen.getByRole('button', { name: 'Use default template' }))

    expect((screen.getByLabelText('Prompt template') as HTMLTextAreaElement).value).toContain(
      'You are a post-processing editor for dictated text.'
    )
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail before the page exists**

Run: `pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/prompts.test.tsx`
Expected: FAIL because `../prompts` and the new route/page wiring do not exist yet.

- [ ] **Step 3: Add the route and Settings nav item**

```tsx
const navItems: NavItem[] = [
  {
    name: 'Providers',
    url: '/providers',
    icon: <HugeiconsIcon icon={Blockchain01Icon} strokeWidth={2} />
  },
  {
    name: 'Prompts',
    url: '/prompts',
    icon: <HugeiconsIcon icon={TextFontIcon} strokeWidth={2} />
  }
]
```

```tsx
import { Prompts } from '@renderer/pages/main/prompts'

export const router = createHashRouter([
  {
    path: '/',
    element: <MainRoot />,
    children: [
      { index: true, Component: Dashboard },
      { path: 'providers', Component: Providers },
      { path: 'prompts', Component: Prompts },
      { path: 'brocas', Component: Brocas },
      { path: 'instructions', Component: Instructions },
      { path: 'dictionary', Component: Dictionary },
      { path: 'about-me', Component: AboutMe }
    ]
  }
])
```

- [ ] **Step 4: Implement the Prompts page**

```tsx
export const Prompts: React.FC = () => {
  const { data: savedTemplate, isHydrated, update } = useStore(promptsStore)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  const form = useForm({
    defaultValues: {
      template: savedTemplate.template || defaultCleanupPromptTemplate
    },
    onSubmit: async ({ value }) => {
      await update({ template: value.template })
      form.reset(value)
    }
  })

  React.useEffect(() => {
    if (!isHydrated) {
      return
    }

    form.reset({
      template: savedTemplate.template || defaultCleanupPromptTemplate
    })
  }, [form, isHydrated, savedTemplate.template])

  function insertPlaceholder(token: string) {
    const textarea = textareaRef.current
    const current = form.getFieldValue('template')

    if (!textarea) {
      form.setFieldValue('template', `${current}${token}`)
      return
    }

    const start = textarea.selectionStart ?? current.length
    const end = textarea.selectionEnd ?? current.length
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`

    form.setFieldValue('template', next)

    queueMicrotask(() => {
      textarea.focus()
      const caret = start + token.length
      textarea.setSelectionRange(caret, caret)
    })
  }

  return (
    <form className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6" onSubmit={...}>
      <form.Subscribe selector={(state) => state}>
        {(state) => {
          const hasChanges = isHydrated && state.values.template !== (savedTemplate.template || defaultCleanupPromptTemplate)

          return (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <TypographyH3 className="text-left">Prompts</TypographyH3>
                <TypographyMuted className="not-first:mt-2">
                  Edit the full system prompt template that OpenBroca sends to the LLM.
                </TypographyMuted>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => form.setFieldValue('template', defaultCleanupPromptTemplate)}>
                  Use default template
                </Button>
                {hasChanges ? <Button type="submit">Save changes</Button> : null}
              </div>
            </div>
          )
        }}
      </form.Subscribe>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CardContent className="px-0">
          <form.Field name="template">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Prompt template</FieldLabel>
                <FieldContent>
                  <Textarea
                    ref={textareaRef}
                    id={field.name}
                    name={field.name}
                    rows={24}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </CardContent>

        <CardContent className="px-0">
          <TypographyLarge>Placeholder reference</TypographyLarge>
          {(['available', 'planned'] as const).map((category) => (
            <div key={category} className="mt-4 space-y-3">
              {promptPlaceholderDefinitions
                .filter((item) => item.category === category)
                .map((item) => (
                  <button key={item.key} type="button" onClick={() => insertPlaceholder(item.token)}>
                    {item.token}
                  </button>
                ))}
            </div>
          ))}
        </CardContent>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Run the page tests to verify they pass**

Run: `pnpm vitest run apps/desktop/src/renderer/src/pages/main/__tests__/prompts.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/desktop/src/renderer/src/components/nav-settings.tsx apps/desktop/src/renderer/src/router/index.tsx apps/desktop/src/renderer/src/pages/main/prompts.tsx apps/desktop/src/renderer/src/pages/main/__tests__/prompts.test.tsx apps/desktop/src/renderer/src/stores/prompts-store.ts
git commit -m "feat: add prompts template editor page"
```

## Task 3: Resolve Templates In Runtime And Wire Them Into The Pipeline

**Files:**
- Modify: `apps/desktop/src/shared/prompt-template.ts`
- Modify: `apps/desktop/src/main/cleanup-prompt.ts`
- Modify: `apps/desktop/src/main/post-recording-pipeline.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/__tests__/cleanup-prompt.test.ts`
- Modify: `apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`

- [ ] **Step 1: Write the failing runtime-resolution tests**

```ts
import {
  defaultCleanupPromptTemplate,
  resolvePromptTemplate
} from '../../shared/prompt-template'

test('replaces implemented placeholders with runtime values and unknown placeholders with empty strings', () => {
  const result = resolvePromptTemplate(
    'Hello {{about_me.nickname}} {{dictionary.hotwords}} {{unknown.future}}',
    {
      dictionary: {
        entries: [
          {
            id: '1',
            term: 'Typeless',
            type: 'hotword',
            usageCount: 1,
            createdAt: '',
            updatedAt: ''
          }
        ]
      },
      aboutMe: {
        nickname: 'Peiqiang',
        email: '',
        occupation: '',
        bio: ''
      },
      matchedInstructionText: null
    }
  )

  expect(result).toContain('Peiqiang')
  expect(result).toContain('Typeless')
  expect(result).not.toContain('{{unknown.future}}')
})
```

```ts
test('uses the saved prompt template when provided to the pipeline', async () => {
  const llmProvider = {
    id: 'openai-codex',
    displayName: 'OpenAI Codex',
    isConfigured: () => true,
    listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
    generate: vi.fn().mockResolvedValue({
      content: 'Send this now.',
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
    getDictionarySettings: () => ({ entries: [] }),
    getAboutMeSettings: () => ({ nickname: 'Peiqiang', email: '', occupation: '', bio: '' }),
    getPromptTemplateSettings: () => ({
      template: 'Nickname: {{about_me.nickname}} Future: {{future.placeholder}}'
    })
  } as never)

  await pipeline.process(recording)

  const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
  expect(llmRequest?.messages[0]?.content).toContain('Nickname: Peiqiang')
  expect(llmRequest?.messages[0]?.content).not.toContain('{{future.placeholder}}')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
Expected: FAIL because `resolvePromptTemplate` and prompt-template pipeline wiring do not exist yet.

- [ ] **Step 3: Implement runtime placeholder resolution in the shared module**

```ts
export type PromptTemplateRuntimeContext = {
  dictionary: DictionarySettings
  aboutMe: AboutMeSettings
  matchedInstructionText?: string | null
}

function createPlaceholderValueMap(context: PromptTemplateRuntimeContext): Record<string, string> {
  const dictionaryBlock = serializeDictionary(context.dictionary)
  const aboutMeBlock = serializeAboutMe(context.aboutMe)
  const matchedInstructions = sanitizeForPromptLine(context.matchedInstructionText ?? '')

  return {
    dictionary: dictionaryBlock,
    'dictionary.hotwords': serializeDictionaryHotwords(context.dictionary),
    'dictionary.replacements': serializeDictionaryReplacements(context.dictionary),
    'dictionary.notes': serializeDictionaryNotes(context.dictionary),
    about_me: aboutMeBlock,
    'about_me.nickname': sanitizeForPromptLine(context.aboutMe.nickname),
    'about_me.email': sanitizeForPromptLine(context.aboutMe.email),
    'about_me.occupation': sanitizeForPromptLine(context.aboutMe.occupation),
    'about_me.bio': sanitizeForPromptLine(context.aboutMe.bio),
    matched_instructions: matchedInstructions,
    'matched_instructions.text': matchedInstructions
  }
}

export function resolvePromptTemplate(
  template: string,
  context: PromptTemplateRuntimeContext
): string {
  const values = createPlaceholderValueMap(context)

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey) => values[rawKey] ?? '')
}
```

- [ ] **Step 4: Refactor cleanup prompt building and pipeline context**

```ts
import {
  defaultCleanupPromptTemplate,
  resolvePromptTemplate
} from '../shared/prompt-template'

export interface CleanupPromptContext extends PromptTemplateRuntimeContext {
  template?: string
}

export function buildCleanupSystemPrompt(context: CleanupPromptContext): string {
  const template =
    typeof context.template === 'string' && context.template.length > 0
      ? context.template
      : defaultCleanupPromptTemplate

  return resolvePromptTemplate(template, context)
}
```

```ts
type CleanupPromptContextGetters = {
  getDictionarySettings?: () => DictionarySettings
  getAboutMeSettings?: () => AboutMeSettings
  getPromptTemplateSettings?: () => PromptTemplateSettings
}

const systemPrompt = buildCleanupSystemPrompt({
  dictionary: this.deps.getDictionarySettings?.() ?? defaultDictionarySettings,
  aboutMe: this.deps.getAboutMeSettings?.() ?? defaultAboutMeSettings,
  matchedInstructionText: matchedInstruction?.customInstructions ?? null,
  template: this.deps.getPromptTemplateSettings?.().template
})
```

```ts
const postRecordingPipeline = new PostRecordingPipeline({
  // existing deps,
  getDictionarySettings: () => normalizeDictionarySettings(store.get('dictionary')),
  getAboutMeSettings: () => normalizeAboutMeSettings(store.get('aboutMe')),
  getPromptTemplateSettings: () => normalizePromptTemplateSettings(store.get('prompts'))
})
```

- [ ] **Step 5: Extend cleanup-prompt and pipeline tests**

```ts
test('default cleanup template resolves planned placeholders to empty strings', () => {
  const result = resolvePromptTemplate(
    '{{raw_transcript}}|{{matched_instructions}}|{{not.real}}',
    {
      dictionary: { entries: [] },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' },
      matchedInstructionText: null
    }
  )

  expect(result).toBe('| |')
})
```

- [ ] **Step 6: Run the runtime integration tests**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full scoped suite for this feature**

Run: `pnpm vitest run apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts apps/desktop/src/main/trpc/routers/__tests__/store.test.ts apps/desktop/src/renderer/src/stores/__tests__/prompts-store.test.ts apps/desktop/src/renderer/src/pages/main/__tests__/prompts.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/desktop/src/shared/prompt-template.ts apps/desktop/src/main/cleanup-prompt.ts apps/desktop/src/main/post-recording-pipeline.ts apps/desktop/src/main/index.ts apps/desktop/src/main/__tests__/cleanup-prompt.test.ts apps/desktop/src/main/__tests__/post-recording-pipeline.test.ts
git commit -m "feat: resolve custom prompt templates at runtime"
```

## Self-Review

### Spec Coverage

- sidebar navigation under `Settings`: covered by Task 2
- new `/prompts` route and page: covered by Task 2
- full-template textarea editor with `Save changes`: covered by Task 2
- `Use default template`: covered by Task 2
- placeholder reference with click-to-insert: covered by Task 2
- prompt-template persistence and normalization: covered by Task 1
- shared default template and placeholder source of truth: covered by Task 1 and Task 3
- permissive save behavior: covered by Task 2
- runtime unknown/future placeholders resolving to empty strings: covered by Task 3
- cleanup pipeline integration: covered by Task 3

### Placeholder Scan

- no unresolved placeholder markers remain
- each code-changing step includes explicit code blocks
- each validation step includes an exact command and expected result

### Type Consistency

- `PromptTemplateSettings` is defined once in `apps/desktop/src/shared/prompt-template.ts`
- `promptsStore` consumes the shared type and normalizer
- runtime resolution uses `PromptTemplateRuntimeContext` consistently between the shared module, cleanup prompt builder, and post-recording pipeline

