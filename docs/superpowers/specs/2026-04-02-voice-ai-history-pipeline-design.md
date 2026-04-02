# Voice AI History Pipeline Design

**Date:** 2026-04-02

## Goal

Run the full post-recording voice pipeline in the desktop app after the user releases the shortcut:

- capture one complete utterance
- persist the recording as a durable WAV file
- transcribe it with the active ASR provider
- post-process the transcript with the active LLM provider
- write a history record that can be replayed from the dashboard
- retain complete debug evidence for every run

The immediate user-facing goal is to replace the current "save a WAV into temp and stop" behavior with a working end-to-end flow that produces durable history items in [`dashboard.tsx`](/Users/liupeiqiang/.codex/worktrees/3477/openbroca/apps/desktop/src/renderer/src/pages/main/dashboard.tsx).

The immediate engineering goal is to introduce a clear post-recording domain boundary so audio capture, provider orchestration, history persistence, and debug inspection can evolve independently.

## Scope

This design covers one-shot processing only:

- press shortcut to start recording
- release shortcut to stop recording
- process the finished recording as a single batch

This design explicitly does not include:

- real-time transcription while recording
- streaming LLM output while recording
- background job queues
- automatic retries
- waveform editing or advanced playback controls
- agent-style multi-step LLM workflows

## Current State

The current implementation in [`listening-session.ts`](/Users/liupeiqiang/.codex/worktrees/3477/openbroca/apps/desktop/src/main/listening-session.ts) captures PCM chunks, builds a WAV file, and writes it to the system temp directory.

Current gaps:

- the recording is not stored in an app-owned durable location
- no ASR provider is invoked after recording ends
- no LLM provider is invoked after transcription
- no history record is persisted
- [`dashboard.tsx`](/Users/liupeiqiang/.codex/worktrees/3477/openbroca/apps/desktop/src/renderer/src/pages/main/dashboard.tsx) renders static placeholder history data
- no per-recording debug trail exists in a user-inspectable form

At the same time, the provider platform is already capable of supporting this work:

- active provider selections are persisted in the desktop store
- ASR providers can be resolved through the ASR registry
- LLM providers can be resolved through the LLM registry
- Deepgram already supports streaming `transcribe()`
- OpenAI and OpenAI Codex already support non-streaming `generate()`

The missing piece is the desktop-side orchestration layer that connects recording completion to provider execution and history persistence.

## Decision Summary

The desktop app will introduce a dedicated post-recording pipeline rather than expanding `ListeningSessionManager` into a multi-purpose orchestration class.

The design introduces four bounded units:

1. `ListeningSessionManager`
2. `RecordingStorage`
3. `PostRecordingPipeline`
4. `HistoryRepository`

These units produce a single flow:

`shortcut release -> stop capture -> persist WAV -> transcribe via active ASR -> post-process via active LLM -> persist history/debug record -> render in dashboard`

This keeps recording lifecycle concerns isolated from provider orchestration and from history presentation.

## Architecture

### 1. ListeningSessionManager

`ListeningSessionManager` remains the owner of recording lifecycle:

- start capture
- stop capture
- aggregate PCM chunks
- surface lifecycle state transitions
- emit one completed recording payload once capture ends

It must not own:

- provider resolution
- history persistence
- dashboard-specific formatting
- debug record assembly

The class should stop treating "recording finished" as "all work finished." Its responsibility ends once it has the complete audio payload needed for downstream processing.

### 2. RecordingStorage

`RecordingStorage` is a new main-process service that persists audio to an app-owned durable directory under Electron `userData`, not under `temp`.

Responsibilities:

- create and maintain a recordings directory such as `userData/recordings`
- generate stable file names
- write WAV bytes atomically
- return a persistent storage result containing:
  - `audioFilePath`
  - `fileName`
  - `byteLength`
  - any derived metadata needed by history

This service creates the persistence boundary for replayable audio.

### 3. PostRecordingPipeline

`PostRecordingPipeline` is the main domain service added by this design. It accepts one finished recording and runs the ordered workflow:

1. create a processing history record
2. persist the WAV file
3. resolve the active ASR provider and transcribe
4. resolve the active LLM provider and post-process the transcript
5. finalize the history record as completed or failed

It also owns the debug trail:

- request summaries
- response summaries
- timing information
- provider IDs
- normalized errors

This service is allowed to understand the end-to-end business workflow, but it should not own renderer state or UI composition.

### 4. HistoryRepository

`HistoryRepository` is the persistence boundary for finished and in-progress voice records.

Responsibilities:

- create new history records
- update records as the pipeline advances
- list records for dashboard consumption
- fetch one record with full debug detail
- persist all debug data for every run

This repository should provide a stable domain model so the dashboard does not need to infer status from partial raw store fragments.

## Data Model

One history item represents one shortcut-held utterance and its entire downstream processing chain.

### Summary Layer

The summary layer is used by the dashboard history list.

Suggested fields:

- `id`
- `createdAt`
- `updatedAt`
- `status`: `processing | completed | failed`
- `audioFilePath`
- `audioDurationMs`
- `finalText`
- `failureStage`: `storage | asr | llm | persistence | null`
- `failureMessage`
- `asrProviderId`
- `llmProviderId`

Rules:

- `finalText` is the primary text shown in history
- failed items remain visible in history
- a failed item may still retain partial results from completed stages
- provider IDs are stored as a snapshot of what was active for this run

### Debug Layer

Every history item also stores a full debug layer, regardless of whether debug mode is currently enabled in the UI.

Suggested fields:

- `rawTranscriptionText`
- `asrSegments`
- `asrRequest`
- `asrResponseSummary`
- `llmRequest`
- `llmResponseSummary`
- `tokenUsage`
- `timeline`
- `errors`

Guidelines:

- store display-oriented summaries, not raw provider SDK objects
- `timeline` records phase boundaries and outcomes
- `errors` stores normalized failures in one place
- the debug layer exists for every run and is only gated by UI visibility

### Failure Model

The record remains durable even when the pipeline fails.

If a run fails:

- keep the history item
- keep the audio file path if storage succeeded
- keep all earlier stage results
- mark `status = failed`
- set `failureStage`
- set `failureMessage`

This preserves evidence and supports future rerun or investigation workflows.

## Pipeline Execution

The post-recording pipeline runs only after the user releases the shortcut and recording has fully stopped.

### Step 1: Create Processing Record

As soon as a recording payload is available, the pipeline creates a history item with:

- `status = processing`
- timestamps
- audio duration
- active provider snapshots

This allows the dashboard to show work in progress instead of hiding the utterance until all downstream processing finishes.

### Step 2: Persist WAV

The pipeline passes the finished PCM plus audio format to `RecordingStorage`, which builds a WAV file and writes it into durable storage.

On success:

- update the history item with `audioFilePath`

On failure:

- mark the record as failed at `storage`
- stop further processing

### Step 3: Run ASR

The pipeline resolves the active ASR provider from the existing store-backed provider selection state.

The current ASR contract accepts `AsyncIterable<Uint8Array>` containing raw PCM frames, not a WAV file path. The first implementation should preserve this boundary:

- use PCM chunks for ASR input
- use WAV output only for durable replay

This avoids having to decode the just-written WAV back into PCM for cloud ASR providers such as Deepgram.

ASR outputs persisted into the record include:

- `rawTranscriptionText`
- `asrSegments`
- `asrRequest`
- `asrResponseSummary`
- `timeline` entries for ASR

If no active ASR provider is configured, or transcription fails:

- mark the record as failed at `asr`
- keep all prior artifacts
- stop before LLM execution

### Step 4: Run LLM Post-Processing

If ASR succeeds, the pipeline resolves the active LLM provider and constructs a narrow, single-purpose prompt:

- role instruction: clean up and post-process dictated transcript text
- user input: the raw ASR transcript

The first implementation should keep the LLM responsibility intentionally small:

- improve readability
- fix obvious dictation artifacts
- produce the final text intended for history display

It should not introduce broader behaviors such as summarization modes, task routing, or multi-step tool use.

LLM outputs persisted into the record include:

- `finalText`
- `llmRequest`
- `llmResponseSummary`
- `tokenUsage`
- `timeline` entries for LLM

If LLM fails:

- mark the record as failed at `llm`
- keep ASR results
- keep the audio artifact
- do not remove the history item

### Step 5: Finalize Record

If all steps succeed:

- set `status = completed`
- set `finalText`
- update timestamps and timeline

If any step fails:

- set `status = failed`
- set `failureStage`
- set `failureMessage`
- keep all partial outputs from completed stages

## Provider Resolution

The pipeline should reuse the existing provider runtime patterns already present in the desktop app:

- active provider selection comes from persisted provider settings
- LLM providers are resolved through current runtime helpers
- ASR providers should gain equivalent runtime resolution helpers if they do not already exist

The key requirement is that each history item stores the provider IDs that were active at the time of execution. Changing active providers later must not mutate historical records.

## Prompting Boundary

The first LLM post-processing prompt should be narrowly scoped and deterministic in intent.

The LLM is not acting as a general assistant. It is acting as a transcript post-processor.

The design goal is:

- raw ASR transcript in
- cleaned final text out

This boundary keeps the first version easy to reason about and reduces surprise in history results.

## UI Behavior

### Dashboard History List

[`dashboard.tsx`](/Users/liupeiqiang/.codex/worktrees/3477/openbroca/apps/desktop/src/renderer/src/pages/main/dashboard.tsx) will stop using static history fixtures and instead render real history records.

Each row should show:

- timestamp
- status
- main text
- replay affordance

Display rules:

- prefer `finalText` as the main text
- show explicit processing state for in-flight items
- keep failed items visible and clearly marked

### History Details

Clicking a history row opens an expanded detail panel for that record within the dashboard page.

Base detail view should include:

- final text
- timestamp
- provider information
- replay control
- failure summary when applicable

### Debug Mode

Debug mode affects only visibility, not data collection.

When debug mode is enabled, the history detail view additionally reveals:

- raw ASR transcript
- ASR request summary
- ASR response summary
- LLM request summary
- LLM response summary
- token usage
- phase timeline
- normalized errors

The system always stores this information. Debug mode only determines whether the renderer shows it.

### Replay

Every history item with a stored audio file should support replay from the durable WAV path.

First-version replay scope:

- play the whole recording
- no editing
- no trimming
- no advanced waveform tooling

The goal is simply to make history items audibly inspectable.

## Settings and Debug Visibility

The app should introduce a global debug visibility preference rather than a data capture toggle.

Recommended behavior:

- store a `debugMode` boolean in app settings
- let the dashboard read this flag
- use it to reveal or hide per-record debug details

This preserves a consistent evidence trail for every recording while keeping the normal UI focused on final user-facing output.

## Error Handling

Errors must be normalized into user-displayable and debug-displayable forms.

Required behavior:

- storage failures stop the pipeline before ASR
- ASR failures stop the pipeline before LLM
- LLM failures still preserve audio and ASR outputs
- persistence failures should be surfaced as best-effort record failures where possible

Error storage should favor stable strings and phase metadata over raw exception objects crossing process or UI boundaries.

## Testing Strategy

### Main Process Tests

Add or update tests to verify:

- recording completion creates a processing record
- WAV files are stored outside the temp directory
- active ASR and LLM providers are resolved from persisted settings
- ASR success writes transcript debug fields
- LLM success writes final text and token usage
- storage failure creates a failed history item
- ASR failure creates a failed history item while preserving earlier artifacts
- LLM failure creates a failed history item while preserving ASR outputs

### Repository Tests

Add tests to verify:

- records can be created, updated, listed, and fetched
- debug detail is retained for all runs
- failed records keep partial outputs

### Renderer Tests

Add or update tests to verify:

- dashboard renders persisted history items instead of fixtures
- processing and failed states are visible
- replay controls render for stored audio items
- debug sections are hidden when debug mode is off
- debug sections are visible when debug mode is on

## Migration Notes

This design does not require a full database migration or a new persistence backend in the first version. It only requires introducing a stable persisted structure for voice history records and wiring the dashboard to that structure.

The first implementation should optimize for clarity of domain boundaries, not for maximum throughput or long-term analytics sophistication.

## Out of Scope

This design does not include:

- real-time dictation UX
- queue workers
- retry orchestration
- transcript versioning
- user-editable prompts
- exporting debug bundles
- pruning or retention policies for recordings and debug records

## Future Evolution

Once this foundation exists, later work can extend it with:

- rerun LLM from stored ASR output
- rerun full processing from stored audio
- retention controls for recordings and debug artifacts
- richer playback UI
- searchable history filters
- queue-based long-running processing

The key architectural constraint for future work is to preserve the current boundaries:

- recording lifecycle remains separate from post-processing
- post-processing remains separate from renderer composition
- history storage remains the durable source of truth for replay and debug inspection
