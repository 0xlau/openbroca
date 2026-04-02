import type { TranscriptionSegment } from '@openbroca/providers/asr'
import type { CompletionRequest, LLMProvider } from '@openbroca/providers/llm'
import type { CapturedRecording } from './recording-types'
import { buildRecognitionInput } from './audio-resampler'
import type { HistoryRepository } from './history-repository'
import type { RecordingStorage } from './recording-storage'
import { selectFirstLLMModel } from './providers/runtime'

const cleanupPrompt =
  'Clean up the dictated transcript into polished final text without changing intent.'

export class PostRecordingPipeline {
  private readonly selectLLMModel: (provider: LLMProvider) => Promise<string>

  constructor(
    private readonly deps: {
      historyRepository: HistoryRepository
      recordingStorage: RecordingStorage
      resolveActiveASRProvider: () => Promise<import('@openbroca/providers/asr').ASRProvider>
      resolveActiveLLMProvider: () => Promise<import('@openbroca/providers/llm').LLMProvider>
      selectLLMModel?: (provider: LLMProvider) => Promise<string>
    }
  ) {
    this.selectLLMModel = deps.selectLLMModel ?? selectFirstLLMModel
  }

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

    let llmProvider: import('@openbroca/providers/llm').LLMProvider
    let llmModel: string | undefined
    let llmRequest: CompletionRequest | undefined
    try {
      pushTimeline('llm', 'started')
      llmProvider = await this.deps.resolveActiveLLMProvider()
      console.debug('[voice-debug] active LLM provider resolved', {
        providerId: llmProvider.id,
        displayName: llmProvider.displayName
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
          errors: [...errors],
          timeline: [...timeline]
        }
      })
      return
    }

    try {
      llmModel = await this.selectLLMModel(llmProvider)
      console.debug('[voice-debug] LLM model selected', {
        model: llmModel
      })
      llmRequest = {
        model: llmModel,
        messages: [
          {
            role: 'system',
            content: cleanupPrompt
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
      this.deps.historyRepository.update(record.id, {
        status: 'completed',
        finalText: result.content,
        debug: {
          llmRequest: { model: llmModel, messages: llmRequest.messages },
          llmResponseSummary: { finishReason: result.finishReason },
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
          llmRequest: llmRequest
            ? { model: llmRequest.model, messages: llmRequest.messages }
            : llmModel
              ? { model: llmModel }
              : undefined,
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
