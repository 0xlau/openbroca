# Typeless Prompt Composition Design

**Date:** 2026-04-17

## Goal

Improve the desktop post-recording LLM prompt so the final text behaves like a strict dictation cleanup pass instead of a general rewrite.

The product goal is:

- preserve the user's original meaning with minimal rewriting
- clean up ASR noise, punctuation, capitalization, and obvious transcription mistakes
- use dictionary entries to stabilize canonical terms without blindly replacing unrelated text
- use `About Me` only for factual alignment, not for style transfer
- allow structural formatting only when the dictated content is already naturally list-like or separable

The engineering goal is:

- replace the single-sentence cleanup prompt with a deterministic prompt builder
- serialize `Dictionary` and `About Me` into model-readable sections
- keep the prompt short enough for routine dictation while making behavior boundaries explicit

## Scope

This design covers:

- system prompt structure for post-recording cleanup
- serialization rules for dictionary entries
- serialization rules for `About Me`
- structural formatting trigger rules
- integration points in the desktop post-recording pipeline

This design does not cover:

- UI changes to the `Dictionary` page
- UI changes to the `About Me` page
- model-specific prompt tuning by provider
- few-shot example libraries

## Decision Summary

Use a layered system prompt with explicit priority rules.

The prompt will have six sections:

1. task definition
2. output principles
3. dictionary rules
4. user facts rules
5. hard constraints
6. serialized context blocks

This prompt shape is preferred over a minimal prompt because the desktop app now has two user-provided context sources that need clear behavioral boundaries.

This prompt shape is preferred over a few-shot prompt because few-shot examples would increase token usage and risk overspecifying one writing style.

## Intended Behavior

### Primary Behavior

The LLM acts as a post-processing editor for dictated text.

Its default behavior is:

- keep the wording close to the raw transcript
- fix obvious ASR mistakes
- improve punctuation and readability
- avoid aggressive rewriting

The app is not asking the model to summarize, expand, or impersonate the user.

### Structural Formatting

Structural formatting is allowed, but only when the raw content already implies structure.

Approved cases include:

- spoken enumerations
- multiple action items
- short comparisons
- clearly separable points
- step-by-step instructions

Disallowed cases include:

- turning a normal paragraph into bullets just because bullets look cleaner
- adding headings that were not implied by the dictated content
- restructuring text in a way that changes emphasis or meaning

The rule is:

- if structure reveals existing organization, allow it
- if structure invents organization, do not do it

## Prompt Design

### Recommended System Prompt

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
{{DICTIONARY_BLOCK}}

About the user:
{{ABOUT_ME_BLOCK}}
```

The raw transcript remains the user message.

### Why This Prompt Shape

This wording makes the model's job narrow and explicit:

- the first section defines the role
- the second section prevents over-rewriting
- the third section constrains dictionary usage
- the fourth section prevents `About Me` from acting like a persona
- the fifth section blocks the common failure modes

This is the minimum prompt complexity that still makes `Dictionary` and `About Me` useful.

## Dictionary Serialization

### Source Model

Current store shape:

```ts
type DictionaryEntry = {
  id: string
  term: string
  type?: 'hotword' | 'replacement'
  replacement?: string
  note?: string
  usageCount: number
  createdAt: string
  updatedAt: string
}
```

### Serialization Goal

The model should receive dictionary content as compact, readable rules instead of raw JSON.

The serialized block should:

- separate `hotword` and `replacement` intent clearly
- preserve canonical casing
- include notes only when present
- omit internal metadata such as ids and timestamps

### Recommended Serialization

```text
hotword:
- Typeless
- OpenBroca

replacement:
- open broca => OpenBroca
- liu pei qiang => Liu Peiqiang

notes:
- Typeless: product name, preserve exact casing
- Liu Peiqiang: person name
```

### Serialization Rules

- only include non-empty entries
- sort by `usageCount` descending, then `updatedAt` descending, so the most relevant terms appear first
- omit the `notes:` section if no entry has a note
- include a `replacement` entry only if both `term` and `replacement` are non-empty
- treat entries with missing `type` as conservative replacements only when a valid `replacement` exists; otherwise treat them as hotwords

### Empty State

If there are no usable entries, emit:

```text
None.
```

This keeps the prompt stable and removes branching logic inside the prompt template.

## About Me Serialization

### Source Model

Current store shape:

```ts
type AboutMeSettings = {
  nickname: string
  email: string
  occupation: string
  bio: string
}
```

### Serialization Goal

The model should receive `About Me` as identity facts for correction only.

This block must not read like a persona or style guide.

### Recommended Serialization

```text
nickname: Peiqiang
email: liupeiqiang@example.com
occupation: Software Engineer
bio: Builds AI and voice tools
```

### Serialization Rules

- only include fields with non-empty trimmed values
- preserve field labels as stable lowercase keys
- do not add explanatory prose around the block
- do not infer new facts from partial fields

### Empty State

If all fields are empty, emit:

```text
None.
```

## Integration Plan

### Prompt Builder Responsibility

Move prompt composition into a dedicated builder function rather than composing the system prompt inline.

Recommended shape:

```ts
type CleanupPromptContext = {
  dictionary: DictionarySettings
  aboutMe: AboutMeSettings
  matchedInstructionText?: string | null
}

function buildCleanupSystemPrompt(context: CleanupPromptContext): string
```

This makes prompt composition testable and prevents `post-recording-pipeline.ts` from growing further.

### Matched Instruction Interaction

The matched instruction text remains additive, but it should be appended after the core dictation rules.

Recommended ordering:

1. core cleanup prompt
2. serialized dictionary block
3. serialized `About Me` block
4. matched app instructions

This preserves global behavior while still allowing per-app instructions to refine output.

If matched instructions are appended, label them explicitly:

```text
Matched app instructions:
{{MATCHED_INSTRUCTION_BLOCK}}
```

### User Message

Keep the raw transcript as the user message rather than embedding it into the system prompt.

This matches the current request shape and makes the role separation clearer.

## Testing Implications

Add prompt-builder level tests that cover:

- empty dictionary and empty `About Me`
- mixed `hotword` and `replacement` entries
- entries with notes
- identity facts present but not style instructions
- matched app instructions appended after the core prompt
- prompt text includes the structural formatting condition

Add pipeline tests that verify:

- the generated request includes dictionary and `About Me` blocks
- the request remains stable when either store is empty
- matched instructions still appear in the final system prompt

## Risks And Mitigations

### Risk: Over-Rewriting

If the prompt is too broad, the model may start paraphrasing instead of cleaning.

Mitigation:

- emphasize "keep wording close"
- explicitly ban aggressive rewriting
- keep raw transcript in the user message

### Risk: Blind Dictionary Replacement

If replacements are described too strongly, the model may replace unrelated phrases.

Mitigation:

- instruct "clearly intended to match"
- separate hotwords from replacements
- keep notes optional and conservative

### Risk: Persona Leakage From About Me

If the profile block reads like a persona, the model may inject tone or unspoken facts.

Mitigation:

- frame it as factual alignment only
- explicitly forbid tone and personality changes
- serialize only raw fields

### Risk: Over-Structuring

If formatting guidance is vague, the model may force bullets everywhere.

Mitigation:

- allow structure only when already implied
- explicitly forbid forced headings and bullets

## Open Decisions

The design intentionally leaves two decisions to implementation:

- whether dictionary ordering should use `usageCount` only or a mixed relevance heuristic
- whether app-specific instructions should be able to override structural formatting behavior

The default implementation should keep both conservative:

- simple ordering is sufficient initially
- app-specific instructions should refine but not bypass the hard constraints

## Recommended Next Step

Implement a dedicated cleanup prompt builder in desktop main-process code, then update the post-recording pipeline and tests to consume it.
