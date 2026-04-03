import type { TranscriptionSegment } from '@openbroca/providers/asr'
import type { CompletionRequest } from '@openbroca/providers/llm'
import type { CapturedRecording } from './recording-types'
import { buildRecognitionInput } from './audio-resampler'
import type { HistoryRepository } from './history-repository'
import type { MatchedInstructionRule } from './instructions/matcher'
import type { RecordingStorage } from './recording-storage'
import type { AutoEnterService } from './send-key/auto-enter'

const cleanupPrompt =
  'Clean up the dictated transcript into polished final text without changing intent.'

export class PostRecordingPipeline {
  constructor(
    private readonly deps: {
      historyRepository: HistoryRepository
      recordingStorage: RecordingStorage
      resolveActiveASRProvider: () => Promise<import('@openbroca/providers/asr').ASRProvider>
      resolveActiveLLMSelection: () => Promise<{
        provider: import('@openbroca/providers/llm').LLMProvider
        model: string
      }>
      resolveMatchedInstruction?: (
        frontmostAppSnapshot?: CapturedRecording['frontmostAppSnapshot']
      ) => Promise<MatchedInstructionRule | null>
      autoEnterService?: AutoEnterService
    }
  ) {}

  async process(recording: CapturedRecording): Promise<void> {
    console.debug('[voice-debug] post-recording pipeline started', {
      durationMs: recording.durationMs,
      sampleRate: recording.format.sampleRate,
      channels: recording.format.channels,
      bitDepth: recording.format.bitDepth,
      chunkCount: recording.chunks.length
    })

    const timeline: Array<{
      stage: 'storage' | 'asr' | 'llm'
      status: 'started' | 'completed' | 'failed'
      at: string
      message?: string
    }> = []
    const errors: Array<{ stage: 'storage' | 'asr' | 'llm'; message: string; at: string }> = []
    const now = () => new Date().toISOString()

    const record = this.deps.historyRepository.create({
      status: 'processing',
      audioDurationMs: recording.durationMs,
      asrProviderId: undefined,
      llmProviderId: undefined
    })

    const pushTimeline = (
      stage: 'storage' | 'asr' | 'llm',
      status: 'started' | 'completed' | 'failed',
      message?: string
    ) => {
      const entry = { stage, status, at: now(), ...(message ? { message } : {}) }
      timeline.push(entry)
      console.debug('[voice-debug] pipeline timeline', entry)
      return entry
    }

    try {
      pushTimeline('storage', 'started')
      const stored = await this.deps.recordingStorage.save(recording)
      console.debug('[voice-debug] recording stored', {
        audioFilePath: stored.audioFilePath,
        byteLength: stored.byteLength
      })
      pushTimeline('storage', 'completed')
      this.deps.historyRepository.update(record.id, {
        audioFilePath: stored.audioFilePath,
        debug: {
          timeline: [...timeline]
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ stage: 'storage', message, at: now() })
      pushTimeline('storage', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'storage',
        failureMessage: message,
        debug: {
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    let asrProvider: import('@openbroca/providers/asr').ASRProvider
    try {
      pushTimeline('asr', 'started')
      asrProvider = await this.deps.resolveActiveASRProvider()
      console.debug('[voice-debug] active ASR provider resolved', {
        providerId: asrProvider.id,
        displayName: asrProvider.displayName
      })
      this.deps.historyRepository.update(record.id, {
        asrProviderId: asrProvider.id
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ stage: 'asr', message, at: now() })
      pushTimeline('asr', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'asr',
        failureMessage: message,
        debug: {
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    let rawTranscriptionText = ''
    let asrSegments: TranscriptionSegment[] = []
    const asrRequest = { language: 'en' }
    if (recording.format.sampleRate !== 16000) {
      console.debug('[voice-debug] resampling audio for ASR', {
        fromSampleRate: recording.format.sampleRate,
        toSampleRate: 16000,
        chunkCount: recording.chunks.length
      })
    }
    const recognitionInput = buildRecognitionInput(recording)

    try {
      const asrResult = await asrProvider.recognize(recognitionInput, asrRequest)
      rawTranscriptionText = asrResult.text ?? ''
      asrSegments = asrResult.segments ?? []
      console.debug('[voice-debug] ASR transcription finalized', {
        finalTranscript: rawTranscriptionText,
        segmentCount: asrSegments.length
      })
      pushTimeline('asr', 'completed')
      this.deps.historyRepository.update(record.id, {
        debug: {
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length },
          timeline: [...timeline]
        }
      })
    } catch (error) {
      rawTranscriptionText = ''
      asrSegments = []
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ stage: 'asr', message, at: now() })
      pushTimeline('asr', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'asr',
        failureMessage: message,
        debug: {
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length },
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    let matchedInstruction: MatchedInstructionRule | null = null
    if (this.deps.resolveMatchedInstruction) {
      try {
        matchedInstruction = await this.deps.resolveMatchedInstruction(
          recording.frontmostAppSnapshot ?? null
        )
        console.debug('[voice-debug] matched instruction resolved', {
          ruleId: matchedInstruction?.ruleId ?? null,
          autoEnter: matchedInstruction?.autoEnter ?? false
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.debug('[voice-debug] matched instruction resolution failed', {
          message
        })
      }
    }
    const matchedInstructionDebug = matchedInstruction
      ? {
          ruleId: matchedInstruction.ruleId,
          name: matchedInstruction.name,
          autoEnter: matchedInstruction.autoEnter,
          customInstructions: matchedInstruction.customInstructions
        }
      : null

    let llmProvider: import('@openbroca/providers/llm').LLMProvider
    let llmModel = ''
    let llmRequest: CompletionRequest | undefined
    const buildLLMRequestDebug = (): Record<string, unknown> | undefined => {
      if (llmRequest) {
        return {
          model: llmRequest.model,
          messages: llmRequest.messages,
          matchedInstruction: matchedInstructionDebug
        }
      }

      if (llmModel || matchedInstructionDebug) {
        return {
          ...(llmModel ? { model: llmModel } : {}),
          matchedInstruction: matchedInstructionDebug
        }
      }

      return undefined
    }
    try {
      pushTimeline('llm', 'started')
      const llmSelection = await this.deps.resolveActiveLLMSelection()
      llmProvider = llmSelection.provider
      llmModel = llmSelection.model
      console.debug('[voice-debug] active LLM provider resolved', {
        providerId: llmProvider.id,
        displayName: llmProvider.displayName
      })
      console.debug('[voice-debug] LLM model selected', {
        model: llmModel
      })
      this.deps.historyRepository.update(record.id, {
        llmProviderId: llmProvider.id
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ stage: 'llm', message, at: now() })
      pushTimeline('llm', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'llm',
        failureMessage: message,
        debug: {
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length },
          llmRequest: buildLLMRequestDebug(),
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    try {
      const customInstructions = matchedInstruction?.customInstructions.trim()
      const systemPrompt = customInstructions
        ? `${cleanupPrompt}\n\nMatched app instructions:\n${customInstructions}`
        : cleanupPrompt

      llmRequest = {
        model: llmModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: rawTranscriptionText
          }
        ]
      }
      console.debug('[voice-debug] sending transcript to LLM', {
        transcriptLength: rawTranscriptionText.length
      })
      const result = await llmProvider.generate(llmRequest)
      console.debug('[voice-debug] LLM result received', {
        finishReason: result.finishReason,
        contentLength: result.content.length
      })
      pushTimeline('llm', 'completed')

      const autoEnterRequested = matchedInstruction?.autoEnter === true
      let autoEnterSummary: Record<string, unknown> = {
        requested: autoEnterRequested,
        triggered: false
      }
      if (autoEnterRequested) {
        if (this.deps.autoEnterService) {
          try {
            await this.deps.autoEnterService.triggerAutoEnter()
            autoEnterSummary = {
              requested: true,
              triggered: true
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            autoEnterSummary = {
              requested: true,
              triggered: false,
              failureMessage: message
            }
            console.debug('[voice-debug] auto enter trigger failed', {
              message
            })
          }
        } else {
          autoEnterSummary = {
            requested: true,
            triggered: false,
            skipped: 'service-unavailable'
          }
        }
      }

      this.deps.historyRepository.update(record.id, {
        status: 'completed',
        finalText: result.content,
        debug: {
          llmRequest: buildLLMRequestDebug(),
          llmResponseSummary: {
            finishReason: result.finishReason,
            matchedInstruction: matchedInstructionDebug,
            autoEnter: autoEnterSummary
          },
          tokenUsage: result.usage,
          timeline: [...timeline]
        }
      })
      console.debug('[voice-debug] post-recording pipeline completed', {
        recordId: record.id,
        status: 'completed'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ stage: 'llm', message, at: now() })
      pushTimeline('llm', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'llm',
        failureMessage: message,
        debug: {
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length },
          llmRequest: buildLLMRequestDebug(),
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      console.debug('[voice-debug] post-recording pipeline failed', {
        recordId: record.id,
        stage: 'llm',
        message
      })
    }
  }
}
