# Prompts Template Editor Design

**Date:** 2026-04-17

## Goal

Add a new desktop `Prompts` page under the existing `Settings` sidebar group so users can edit the full LLM system prompt template used by the dictation cleanup pipeline.

The product goal is:

- give users a dedicated page for editing the complete system prompt template
- let users insert supported placeholders without memorizing their names
- preserve the existing `About Me` page layout language so the page feels native to the app
- allow fully freeform template editing without blocking save
- treat unknown or future placeholders as safe no-op values at runtime

The engineering goal is:

- store a user-editable prompt template separately from the resolved runtime prompt
- keep placeholder definitions and default template text in one shared source of truth
- resolve the template in main-process runtime code using the existing prompt-context inputs
- avoid coupling page UI state to prompt resolution logic

## Scope

This design covers:

- sidebar navigation changes under `Settings`
- a new `/prompts` route and page
- prompt-template persistence and normalization
- placeholder reference UI and click-to-insert behavior
- shared placeholder definitions and default template text
- runtime placeholder resolution rules
- integration with the existing cleanup prompt pipeline

This design does not cover:

- live prompt preview
- prompt syntax highlighting
- save-time validation or linting
- conditional template logic or scripting
- provider-specific prompt templates

## Current Context

The existing sidebar already has a `Settings` group in [nav-settings.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/renderer/src/components/nav-settings.tsx), but it currently contains only `Providers`.

The visual pattern to match is [about-me.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/renderer/src/pages/main/about-me.tsx):

- centered page container
- title and helper copy on the left
- `Save changes` button in the top-right when the form is dirty
- large content area below

The existing prompt system already has a default runtime builder in [cleanup-prompt.ts](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/main/cleanup-prompt.ts). This new feature should not duplicate that logic in the UI. Instead, it should move the source template into shared configuration and let runtime code resolve placeholders against real context.

## Decision Summary

Use a single-page full-template editor with a companion placeholder reference panel.

The page will:

- live at `/prompts`
- appear in `Settings` directly below `Providers`
- prefill the current default system prompt template
- provide a `Use default template` action
- provide a large `textarea` for direct editing
- provide a grouped placeholder reference where each placeholder can be clicked to insert into the textarea

The saved value is a raw template string, not the final prompt.

At runtime:

- known placeholders are replaced with current context values
- future placeholders listed in the UI but not yet implemented resolve to empty strings
- completely unknown placeholders also resolve to empty strings

This is preferred over an append-only custom instructions page because the user explicitly wants full control over the system prompt template.

This is preferred over a preview-heavy editor because preview would introduce extra data-shaping work and increase scope without being required for the first version.

## User Experience

### Navigation

Add a new `Prompts` menu item to [nav-settings.tsx](/Users/liupeiqiang/Studio/OpenSource/openbroca/apps/desktop/src/renderer/src/components/nav-settings.tsx) directly below `Providers`.

Recommended order:

1. `Providers`
2. `Prompts`

### Route

Add a new route:

- `/prompts`

The route lives alongside existing main routes such as `/providers`, `/dictionary`, and `/about-me`.

### Page Layout

The page should visually follow the structure of `About Me`, but the content body is different.

Recommended layout:

- top row:
  - title: `Prompts`
  - description explaining that this template becomes the full system prompt sent to the LLM
  - actions on the right: `Use default template` and `Save changes`
- content row:
  - primary column: one large `textarea`
  - secondary column or lower section: `Placeholder reference`

If the current settings page layout works better stacked than side-by-side at smaller widths, the placeholder reference should flow below the textarea rather than forcing a cramped two-column layout.

### Editor Behavior

The textarea edits the full system prompt template.

The initial value should be the saved template if one exists; otherwise it should show the default template.

The page should not block save if:

- the template is empty
- required placeholders are missing
- unknown placeholders are present

The editor is intentionally permissive.

### Save Behavior

Use the same dirty-state interaction pattern as `About Me`:

- `Save changes` appears only when the page has unsaved edits
- save persists the raw template string
- successful save resets dirty state to the saved content

### Use Default Template

Provide a `Use default template` button in the top-right action area.

This action resets the textarea content to the shared default template text. The user must still save to persist that reset.

This is intentionally separate from auto-resetting when the page opens.

## Placeholder Reference

### Interaction Model

The page includes a `Placeholder reference` panel.

Each placeholder entry shows:

- the placeholder token itself, for example `{{about_me.nickname}}`
- a short human-readable description
- optionally a category badge or section label

Clicking a placeholder inserts it into the textarea at the current cursor position.

If the cursor position cannot be recovered, the placeholder may be appended at the end as a fallback, but the target interaction should be insertion at the active caret.

### Categories

Because the user wants future-facing variables visible from day one, placeholders should be divided into:

- `Available now`
- `Planned`

The `Planned` group is allowed to insert placeholders that currently resolve to empty strings at runtime.

### First-Version Placeholder Set

#### Available now

- `{{dictionary}}`
- `{{dictionary.hotwords}}`
- `{{dictionary.replacements}}`
- `{{dictionary.notes}}`
- `{{about_me}}`
- `{{about_me.nickname}}`
- `{{about_me.email}}`
- `{{about_me.occupation}}`
- `{{about_me.bio}}`
- `{{matched_instructions}}`
- `{{matched_instructions.text}}`

#### Planned

Recommended examples for the first spec:

- `{{raw_transcript}}`
- `{{transcript.language}}`
- `{{frontmost_app.name}}`
- `{{frontmost_app.id}}`
- `{{provider.llm}}`
- `{{provider.asr}}`

The exact planned list can evolve, but the UI should already support showing future variables distinctly from implemented ones.

## Data Model

### Stored Settings

Keep the first-version store shape minimal.

Recommended shape:

```ts
type PromptTemplateSettings = {
  template: string
}
```

Default persisted value:

```ts
{
  template: ''
}
```

### Normalization

Add a shared normalizer so persisted values are predictable.

Recommended shared exports:

```ts
type PromptTemplateSettings = {
  template: string
}

const defaultPromptTemplateSettings: PromptTemplateSettings = {
  template: ''
}

function normalizePromptTemplateSettings(raw: unknown): PromptTemplateSettings
```

Normalization rules:

- if `template` is not a string, normalize to `''`
- trim is not applied automatically to the whole template, because leading/trailing newlines may be intentional

### Shared Source of Truth

The shared module should also define:

- the default template text
- placeholder definitions
- placeholder categories
- runtime template resolution functions

This avoids drift between:

- what the page displays
- what `Use default template` restores
- what runtime uses when no custom template exists

## Runtime Resolution Design

### Core Principle

The page stores a raw template.

The main process resolves that template into a final system prompt using current runtime context.

Do not store resolved prompt text.

### Resolution Model

The resolver treats the template as plain text with token replacement only.

Supported syntax:

- `{{placeholder_name}}`

Not supported:

- conditionals
- loops
- expressions
- nested template logic
- script execution

### Replacement Rules

At runtime:

- implemented placeholders resolve to current context values
- listed future placeholders resolve to `''`
- any unknown placeholder also resolves to `''`

This matches the user's preference for permissive saving plus safe runtime behavior.

### Recommended Resolution Context

The resolver should work from the same context already available to the cleanup prompt builder:

```ts
type PromptTemplateRuntimeContext = {
  dictionary: DictionarySettings
  aboutMe: AboutMeSettings
  matchedInstructionText?: string | null
}
```

The runtime may later grow more fields, but the resolver should not require them in the first version.

### Placeholder Output Semantics

Recommended semantics:

- `{{dictionary}}` resolves to the full serialized dictionary block
- `{{dictionary.hotwords}}` resolves to only the hotword lines
- `{{dictionary.replacements}}` resolves to only the replacement lines
- `{{dictionary.notes}}` resolves to only the notes lines
- `{{about_me}}` resolves to the full serialized about-me block
- `{{about_me.nickname}}`, `{{about_me.email}}`, and so on resolve to the single value or `''`
- `{{matched_instructions}}` and `{{matched_instructions.text}}` resolve to the current matched instruction text or `''`

### Unknown Placeholder Behavior

If a template contains:

- a typo in a known placeholder
- a future placeholder not implemented yet
- a completely custom token

the resolver should replace it with `''`.

This behavior should be deterministic and silent.

## Default Template Strategy

### Shared Default Template

The default template should live in shared code, not only in main-process code.

This template should be functionally equivalent to the current approved Typeless system prompt, but rewritten to use placeholders where appropriate.

Recommended structure:

```text
You are a post-processing editor for dictated text.

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

Dictionary rules:
- Treat the following dictionary as canonical terminology guidance.
- If a transcript word or phrase is clearly intended to match a dictionary term, normalize it to the canonical form.
- For replacement entries, prefer the replacement value when the spoken content clearly refers to that term.
- For hotword entries, preserve the canonical spelling exactly.
- Do not apply dictionary replacements blindly when the meaning does not match.
- If a dictionary note helps disambiguate a term, use it conservatively.

User facts:
- The following profile is only for factual alignment.
- Use it only to correct or stabilize identity-related details when the transcript clearly refers to the user.
- Do not inject profile facts that were never implied by the transcript.
- Do not use the profile to change tone, style, or personality.

Hard constraints:
- Do not change the user's intent.
- Do not make the text more formal, more friendly, or more expressive unless that is already present.
- Do not summarize.
- Do not expand shorthand into extra explanation unless necessary for clarity.
- Do not invent names, titles, links, dates, or contact details.
- Output only the final cleaned text, with no commentary.

Dictionary:
{{dictionary}}

About the user:
{{about_me}}

Matched app instructions:
{{matched_instructions}}
```

The runtime resolver may optionally strip empty trailing sections if needed, but the first version can also keep simple empty replacements.

## UI Architecture

### Renderer Store

Add a persisted renderer store for prompt-template settings, following the same broad pattern as `aboutMeStore`.

The store should:

- hydrate from persisted state
- normalize incoming values
- support `update` and `replace`

### Page Component

The `Prompts` page is responsible for:

- reading the saved template from the store
- loading the default template when there is no saved value
- managing textarea edits
- inserting placeholders into the textarea
- resetting to the shared default template when requested
- saving the raw template string back to the store

### Shared Placeholder Definition Structure

Recommended shape:

```ts
type PromptPlaceholderDefinition = {
  key: string
  token: string
  description: string
  category: 'available' | 'planned'
}
```

The UI should render from these definitions rather than duplicating the list in JSX.

## Integration Plan

### Main Process

Update the runtime prompt pipeline so it uses:

1. the saved custom template if present
2. otherwise the shared default template

The selected template is then resolved against current runtime context and used as the system prompt sent to the LLM.

### Existing Prompt Builder

The current cleanup prompt builder should be refactored into one of two shapes:

1. keep the existing serializer helpers and expose a new template resolver around them
2. move the serializer helpers into a shared prompt-template module, then make the current builder call through that module

I recommend the second option because the page and runtime now share template concerns.

### Error Handling

Resolution should be resilient:

- malformed persisted settings normalize cleanly
- unknown placeholders do not throw
- missing runtime values become `''`

The app should still send a prompt even if the user wrote a poor template.

## Testing Implications

Add tests for:

- prompt-template settings normalization
- page dirty-state and save behavior
- `Use default template` resets the editor value but still requires save
- placeholder click inserts at caret position
- placeholder reference renders both `Available now` and `Planned` groups
- runtime template resolution with implemented placeholders
- runtime template resolution with unknown placeholders resolving to `''`
- runtime template resolution with planned placeholders resolving to `''`

## Risks And Mitigations

### Risk: Default Template Drift

If page defaults and runtime defaults live in separate places, they will diverge.

Mitigation:

- keep default template text in one shared module

### Risk: Placeholder Drift

If the UI placeholder list and runtime resolver are maintained separately, inserted tokens may not resolve correctly.

Mitigation:

- define placeholders from a shared source
- test both display and runtime resolution

### Risk: User Breaks Template

Because saving is permissive, users can remove important instructions.

Mitigation:

- provide `Use default template`
- describe clearly that the page edits the full system prompt
- keep runtime behavior deterministic instead of trying to silently rewrite the template

### Risk: Future Placeholder Confusion

Showing planned placeholders before implementation can confuse users.

Mitigation:

- visually separate `Available now` from `Planned`
- resolve planned placeholders to `''` consistently

## Recommended Next Step

Implement the new `Prompts` route and store, then move default-template and placeholder definitions into a shared prompt-template module that the page and main-process runtime can both consume.
