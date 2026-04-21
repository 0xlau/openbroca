import type { TranscriptionSegment } from '@openbroca/providers/asr'
import type { CompletionRequest } from '@openbroca/providers/llm'
import type { AppIdentity } from '@openbroca/app-identity'
import type { CapturedRecording } from './recording-types'
import { buildRecognitionInput } from './audio-resampler'
import type { HistoryRepository } from './history-repository'
import type { MatchedInstructionRule } from './instructions/matcher'
import type { RecordingStorage } from './recording-storage'
import type { FinalTextDeliveryService } from './final-text-delivery/service'
import { buildCleanupSystemPrompt } from './cleanup-prompt'
import {
  defaultAboutMeSettings,
  normalizeAboutMeSettings,
  type AboutMeSettings
} from '../shared/about-me'
import {
  defaultDictionarySettings,
  normalizeDictionarySettings,
  type DictionarySettings
} from '../shared/dictionary'
import { hasMeaningfulText } from '../shared/meaningful-text'
import {
  normalizePromptTemplateSettings,
  type PromptTemplateSettings
} from '../shared/prompt-template'
import type { VoiceHistoryDeliveryDebug } from '../shared/voice-history'

export interface CleanupPromptRawGetters {
  getDictionaryRaw: () => unknown
  getAboutMeRaw: () => unknown
  getPromptsRaw: () => unknown
}

export interface CleanupPromptContextGetters {
  getDictionarySettings: () => DictionarySettings
  getAboutMeSettings: () => AboutMeSettings
  getPromptTemplateSettings: () => PromptTemplateSettings
}

export interface ProcessOptions {
  signal?: AbortSignal
}

const USER_CANCELLATION_MESSAGE = 'Cancelled by user'

export function createNormalizedCleanupPromptContextGetters(
  rawGetters: CleanupPromptRawGetters
): CleanupPromptContextGetters {
  return {
    getDictionarySettings: () => normalizeDictionarySettings(rawGetters.getDictionaryRaw()),
    getAboutMeSettings: () => normalizeAboutMeSettings(rawGetters.getAboutMeRaw()),
    getPromptTemplateSettings: () => normalizePromptTemplateSettings(rawGetters.getPromptsRaw())
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Post-recording pipeline failed'
}

function buildLLMErrorResponseSummary(error: unknown): Record<string, unknown> | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const rawResponse = Reflect.get(error, 'rawResponse')
  if (rawResponse === undefined) {
    return undefined
  }

  return {
    parseError: normalizeErrorMessage(error),
    rawResponse
  }
}

function createAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason

  if (reason instanceof Error) {
    return reason
  }

  const error = new Error(USER_CANCELLATION_MESSAGE)
  error.name = 'AbortError'
  return error
}

function sameApp(left: AppIdentity, right: AppIdentity): boolean {
  if (left.id === right.id) return true
  if (left.bundleId && right.bundleId && left.bundleId === right.bundleId) return true
  if (left.aumid && right.aumid && left.aumid === right.aumid) return true
  if (left.path && right.path && left.path === right.path) return true
  return false
}

function isPipelineAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (!signal?.aborted) {
    return false
  }

  if (error == null || error === signal.reason) {
    return true
  }

  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }

  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown }
    return (
      error.name === 'AbortError' ||
      error.name === 'CanceledError' ||
      errorWithCode.code === 'ABORT_ERR' ||
      errorWithCode.code === 'ERR_CANCELED'
    )
  }

  if (typeof error === 'object' && error !== null) {
    const maybeAbortError = error as { name?: unknown; code?: unknown }
    return (
      maybeAbortError.name === 'AbortError' ||
      maybeAbortError.name === 'CanceledError' ||
      maybeAbortError.code === 'ABORT_ERR' ||
      maybeAbortError.code === 'ERR_CANCELED'
    )
  }

  return false
}

function createDeliveryFallback(
  targetAppAtMatch: CapturedRecording['targetAppSnapshot'] | null,
  matchedInstruction: MatchedInstructionRule | null,
  instructionPromptApplied: boolean,
  failureMessage: string,
  fallbackReason: VoiceHistoryDeliveryDebug['fallbackReason'] = 'service-unavailable'
): VoiceHistoryDeliveryDebug {
  return {
    targetAppAtMatch: targetAppAtMatch ?? null,
    targetAppAtDelivery: null,
    matchedInstruction: matchedInstruction
      ? {
          ruleId: matchedInstruction.ruleId,
          name: matchedInstruction.name,
          autoEnterMode: matchedInstruction.autoEnterMode
        }
      : null,
    instructionPromptApplied,
    ownershipMatchedAtDelivery: false,
    method: 'pending',
    status: 'failed',
    outcome: 'delivery-failed',
    pasteAttempted: false,
    autoSendTriggered: false,
    failureMessage,
    fallbackReason
  }
}

export class PostRecordingPipeline {
  constructor(
    private readonly deps: {
      historyRepository: HistoryRepository
      recordingStorage: RecordingStorage
      resolveActiveASRSelection: () => Promise<{
        provider: import('@openbroca/providers/asr').ASRProvider
        settings: Record<string, unknown>
      }>
      resolveActiveLLMSelection: () => Promise<{
        provider: import('@openbroca/providers/llm').LLMProvider
        model: string
      }>
      resolveMatchedInstruction?: (
        targetAppSnapshot?: CapturedRecording['targetAppSnapshot']
      ) => Promise<MatchedInstructionRule | null>
      getTargetAppForPrompt?: () => Promise<AppIdentity | null>
      getDictionarySettings?: () => DictionarySettings
      getAboutMeSettings?: () => AboutMeSettings
      getPromptTemplateSettings?: () => PromptTemplateSettings
      finalTextDeliveryService?: FinalTextDeliveryService
    }
  ) {}

  async process(recording: CapturedRecording, options: ProcessOptions = {}): Promise<void> {
    const signal = options.signal
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
    const recordingContextDebug = {
      frontmostAppSnapshot: recording.frontmostAppSnapshot ?? null
    }
    const resolveStageFailureMessage = (error: unknown) =>
      isPipelineAbortError(error, signal) ? USER_CANCELLATION_MESSAGE : normalizeErrorMessage(error)

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

    const recordStageCancellation = (stage: 'asr' | 'llm', debug: Record<string, unknown> = {}) => {
      pushTimeline(stage, 'started')
      const message = USER_CANCELLATION_MESSAGE
      errors.push({ stage, message, at: now() })
      pushTimeline(stage, 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: stage,
        failureMessage: message,
        debug: {
          ...recordingContextDebug,
          ...debug,
          errors: [...errors],
          timeline: [...timeline]
        }
      })
    }

    const throwIfProcessingAborted = () => {
      if (!signal?.aborted) return
      throw createAbortError(signal)
    }

    if (signal?.aborted) {
      recordStageCancellation('asr')
      return
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
          ...recordingContextDebug,
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
          ...recordingContextDebug,
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    let asrProvider: import('@openbroca/providers/asr').ASRProvider
    let asrSettings: Record<string, unknown> = {}
    try {
      pushTimeline('asr', 'started')
      throwIfProcessingAborted()
      const selection = await this.deps.resolveActiveASRSelection()
      asrProvider = selection.provider
      asrSettings = selection.settings ?? {}
      console.debug('[voice-debug] active ASR provider resolved', {
        providerId: asrProvider.id,
        displayName: asrProvider.displayName
      })
      this.deps.historyRepository.update(record.id, {
        asrProviderId: asrProvider.id
      })
    } catch (error) {
      const message = resolveStageFailureMessage(error)
      errors.push({ stage: 'asr', message, at: now() })
      pushTimeline('asr', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'asr',
        failureMessage: message,
        debug: {
          ...recordingContextDebug,
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    let rawTranscriptionText = ''
    let asrSegments: TranscriptionSegment[] = []
    const savedLanguage =
      typeof asrSettings.language === 'string' && asrSettings.language.trim().length > 0
        ? asrSettings.language
        : 'en'
    const asrRequest = {
      language: savedLanguage,
      ...(signal ? { signal } : {})
    }
    if (recording.format.sampleRate !== 16000) {
      console.debug('[voice-debug] resampling audio for ASR', {
        fromSampleRate: recording.format.sampleRate,
        toSampleRate: 16000,
        chunkCount: recording.chunks.length
      })
    }
    const recognitionInput = buildRecognitionInput(recording)

    try {
      throwIfProcessingAborted()
      const asrResult = await asrProvider.recognize(recognitionInput, asrRequest)
      rawTranscriptionText = asrResult.text ?? ''
      asrSegments = asrResult.segments ?? []
      console.debug('[voice-debug] ASR transcription finalized', {
        finalTranscript: rawTranscriptionText,
        segmentCount: asrSegments.length
      })
      if (!hasMeaningfulText(rawTranscriptionText)) {
        const message = 'ASR returned empty transcript'
        errors.push({ stage: 'asr', message, at: now() })
        pushTimeline('asr', 'failed', message)
        this.deps.historyRepository.update(record.id, {
          status: 'failed',
          failureStage: 'asr',
          failureMessage: message,
          debug: {
            ...recordingContextDebug,
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

      pushTimeline('asr', 'completed')
      this.deps.historyRepository.update(record.id, {
        debug: {
          ...recordingContextDebug,
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
      const message = resolveStageFailureMessage(error)
      errors.push({ stage: 'asr', message, at: now() })
      pushTimeline('asr', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'asr',
        failureMessage: message,
        debug: {
          ...recordingContextDebug,
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

    if (signal?.aborted) {
      recordStageCancellation(
        'llm',
        {
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length }
        }
      )
      return
    }

    let matchedInstruction: MatchedInstructionRule | null = null
    const targetAppAtMatch = recording.targetAppSnapshot ?? null
    if (this.deps.resolveMatchedInstruction) {
      try {
        matchedInstruction = await this.deps.resolveMatchedInstruction(targetAppAtMatch)
        console.debug('[voice-debug] matched instruction resolved', {
          ruleId: matchedInstruction?.ruleId ?? null,
          autoEnterMode: matchedInstruction?.autoEnterMode ?? 'off'
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
          autoEnterMode: matchedInstruction.autoEnterMode,
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
      throwIfProcessingAborted()
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
      const message = resolveStageFailureMessage(error)
      errors.push({ stage: 'llm', message, at: now() })
      pushTimeline('llm', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'llm',
        failureMessage: message,
        debug: {
          ...recordingContextDebug,
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length },
          llmRequest: buildLLMRequestDebug(),
          ...(buildLLMErrorResponseSummary(error)
            ? { llmResponseSummary: buildLLMErrorResponseSummary(error) }
            : {}),
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    try {
      let targetAppAtPrompt = targetAppAtMatch

      if (matchedInstruction && this.deps.getTargetAppForPrompt) {
        try {
          targetAppAtPrompt = await this.deps.getTargetAppForPrompt()
        } catch (error) {
          console.debug('[voice-debug] prompt-time app resolution failed', {
            error: error instanceof Error ? error.message : String(error),
            fallbackTargetAppId: targetAppAtMatch?.id ?? null
          })
          targetAppAtPrompt = targetAppAtMatch
        }
      }

      const instructionPromptApplied = Boolean(
        matchedInstruction &&
          matchedInstruction.activationApp &&
          targetAppAtPrompt &&
          sameApp(matchedInstruction.activationApp, targetAppAtPrompt)
      )
      const systemPrompt = buildCleanupSystemPrompt({
        dictionary: this.deps.getDictionarySettings?.() ?? defaultDictionarySettings,
        aboutMe: this.deps.getAboutMeSettings?.() ?? defaultAboutMeSettings,
        matchedInstructionText: instructionPromptApplied
          ? matchedInstruction?.customInstructions ?? null
          : null,
        template: this.deps.getPromptTemplateSettings?.().template
      })

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
        ],
        ...(signal ? { signal } : {})
      }
      console.debug('[voice-debug] sending transcript to LLM', {
        transcriptLength: rawTranscriptionText.length
      })
      throwIfProcessingAborted()
      const result = await llmProvider.generate(llmRequest)
      console.debug('[voice-debug] LLM result received', {
        finishReason: result.finishReason,
        contentLength: result.content.length
      })
      throwIfProcessingAborted()

      if (!hasMeaningfulText(result.content)) {
        const message = 'LLM returned empty content'
        errors.push({ stage: 'llm', message, at: now() })
        pushTimeline('llm', 'failed', message)
        this.deps.historyRepository.update(record.id, {
          status: 'failed',
          failureStage: 'llm',
          failureMessage: message,
          debug: {
            ...recordingContextDebug,
            rawTranscriptionText,
            asrSegments,
            asrRequest,
            asrResponseSummary: { segmentCount: asrSegments.length },
            llmRequest: buildLLMRequestDebug(),
            llmResponseSummary: {
              finishReason: result.finishReason,
              matchedInstruction: matchedInstructionDebug
            },
            tokenUsage: result.usage,
            errors: [...errors],
            timeline: [...timeline]
          }
        })
        console.debug('[voice-debug] post-recording pipeline failed', {
          recordId: record.id,
          stage: 'llm',
          message
        })
        return
      }

      let delivery: VoiceHistoryDeliveryDebug
      if (!this.deps.finalTextDeliveryService) {
        delivery = createDeliveryFallback(
          targetAppAtMatch,
          matchedInstruction,
          instructionPromptApplied,
          'service-unavailable'
        )
      } else {
        try {
          throwIfProcessingAborted()
          delivery = await this.deps.finalTextDeliveryService.deliver({
            text: result.content,
            matchedInstruction,
            targetAppAtMatch,
            instructionPromptApplied
          })
        } catch (error) {
          if (isPipelineAbortError(error, signal)) {
            throw error
          }

          const message = normalizeErrorMessage(error)
          console.debug('[voice-debug] final text delivery failed', {
            message
          })
          delivery = createDeliveryFallback(
            targetAppAtMatch,
            matchedInstruction,
            instructionPromptApplied,
            message
          )
        }
      }

      throwIfProcessingAborted()
      pushTimeline('llm', 'completed')
      this.deps.historyRepository.update(record.id, {
        status: 'completed',
        finalText: result.content,
        debug: {
          ...recordingContextDebug,
          llmRequest: buildLLMRequestDebug(),
          llmResponseSummary: {
            finishReason: result.finishReason,
            matchedInstruction: matchedInstructionDebug
          },
          delivery,
          tokenUsage: result.usage,
          timeline: [...timeline]
        }
      })
      console.debug('[voice-debug] post-recording pipeline completed', {
        recordId: record.id,
        status: 'completed'
      })
    } catch (error) {
      const message = resolveStageFailureMessage(error)
      errors.push({ stage: 'llm', message, at: now() })
      pushTimeline('llm', 'failed', message)
      this.deps.historyRepository.update(record.id, {
        status: 'failed',
        failureStage: 'llm',
        failureMessage: message,
        debug: {
          ...recordingContextDebug,
          rawTranscriptionText,
          asrSegments,
          asrRequest,
          asrResponseSummary: { segmentCount: asrSegments.length },
          llmRequest: buildLLMRequestDebug(),
          ...(buildLLMErrorResponseSummary(error)
            ? { llmResponseSummary: buildLLMErrorResponseSummary(error) }
            : {}),
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
