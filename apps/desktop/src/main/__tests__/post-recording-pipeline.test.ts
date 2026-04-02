import { describe, expect, test, vi } from 'vitest'
import { PostRecordingPipeline } from '../post-recording-pipeline'

describe('PostRecordingPipeline', () => {
  test('stores audio, runs ASR, runs LLM, and finalizes the history record', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-1' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/one.wav',
        fileName: 'one.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn()
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn().mockResolvedValue({
        content: 'Send the report by Friday.',
        finishReason: 'stop',
        usage: { promptTokens: 12, completionTokens: 9, totalTokens: 21 }
      })
    }

    asrProvider.recognize.mockResolvedValue({
      text: 'send the report by friday',
      segments: [{ text: 'send the report by friday', isFinal: true }]
    })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue(asrProvider),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    const recognizeInput = asrProvider.recognize.mock.calls[0]?.[0] as
      | { audio?: Uint8Array[] }
      | undefined
    expect(Array.isArray(recognizeInput?.audio)).toBe(true)
    expect(asrProvider.recognize).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1
      }),
      { language: 'en' }
    )
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(llmProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.2-codex'
      })
    )
    expect(repository.update).toHaveBeenLastCalledWith(
      'record-1',
      expect.objectContaining({
        status: 'completed',
        finalText: 'Send the report by Friday.'
      })
    )
  })

  test('uses RecognitionResult text for LLM and stores ASR segments', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-final-only' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/final-only.wav',
        fileName: 'final-only.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn()
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn().mockResolvedValue({
        content: 'Send the report by Friday.',
        finishReason: 'stop',
        usage: { promptTokens: 12, completionTokens: 9, totalTokens: 21 }
      })
    }

    asrProvider.recognize.mockResolvedValue({
      text: 'send the report by friday',
      segments: [
        { text: 'send the', isFinal: false },
        { text: 'send the report', isFinal: true },
        { text: 'by', isFinal: false },
        { text: 'by friday', isFinal: true }
      ]
    })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue(asrProvider),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(llmRequest?.messages[1]?.content).toBe('send the report by friday')

    const asrUpdate = repository.update.mock.calls.find(
      ([, patch]) => patch?.debug?.rawTranscriptionText !== undefined
    )
    expect(asrUpdate?.[1].debug.rawTranscriptionText).toBe('send the report by friday')
    expect(asrUpdate?.[1].debug.asrSegments).toEqual([
      { text: 'send the', isFinal: false },
      { text: 'send the report', isFinal: true },
      { text: 'by', isFinal: false },
      { text: 'by friday', isFinal: true }
    ])
  })

  test('uses the active llm provider/model pair from a single selection resolver', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-active-model' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/active-model.wav',
        fileName: 'active-model.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'raw transcript',
        segments: [{ text: 'raw transcript', isFinal: true }]
      })
    }
    const llmProvider = {
      id: 'openai',
      displayName: 'OpenAI',
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-first', name: 'gpt-first' }]),
      generate: vi.fn().mockResolvedValue({
        content: 'clean transcript',
        finishReason: 'stop',
        usage: undefined
      })
    }

    const resolveActiveLLMSelection = vi
      .fn()
      .mockResolvedValue({ provider: llmProvider as never, model: 'gpt-4.1' })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRProvider: async () => asrProvider,
      resolveActiveLLMSelection
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(llmProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4.1' })
    )
    expect(llmProvider.listModels).not.toHaveBeenCalled()
    expect(resolveActiveLLMSelection).toHaveBeenCalledTimes(1)
  })

  test('resamples non-16kHz mono PCM to 16kHz before calling ASR', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-resample' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/resampled.wav',
        fileName: 'resampled.wav',
        byteLength: 64
      })
    }
    const capturedAudio: Uint8Array[] = []
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn(async (input: { audio: Uint8Array[] }) => {
        capturedAudio.push(...input.audio)
        return { text: 'hello world', segments: [{ text: 'hello world', isFinal: true }] }
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn().mockResolvedValue({
        content: 'Hello world.',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 3, totalTokens: 7 }
      })
    }

    const inputSamples48k = new Int16Array(480).map((_, index) =>
      Math.round(Math.sin(index / 8) * 12000)
    )

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue(asrProvider),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })
    })

    await pipeline.process({
      format: { sampleRate: 48000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array(inputSamples48k.buffer.slice(0))],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(asrProvider.recognize).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1
      }),
      { language: 'en' }
    )
    const resampledBytes = capturedAudio.reduce((total, chunk) => total + chunk.byteLength, 0)
    expect(resampledBytes).toBeLessThan(inputSamples48k.byteLength)
    expect(resampledBytes).toBeGreaterThan(0)
  })

  test('marks the record failed at llm while preserving ASR output', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-2' })),
      update: vi.fn()
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: {
        save: vi.fn().mockResolvedValue({ audioFilePath: '/recordings/two.wav' })
      } as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue({
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize: vi.fn().mockResolvedValue({
          text: 'raw transcript',
          segments: [{ text: 'raw transcript', isFinal: true }]
        })
      }),
      resolveActiveLLMSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'openai-codex',
          displayName: 'OpenAI Codex',
          isConfigured: () => true,
          listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
          generate: vi.fn().mockRejectedValue(new Error('upstream 500'))
        },
        model: 'gpt-5.2-codex'
      })
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(repository.update).toHaveBeenLastCalledWith(
      'record-2',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'llm',
        debug: expect.objectContaining({
          llmRequest: expect.objectContaining({
            model: 'gpt-5.2-codex'
          }),
          rawTranscriptionText: 'raw transcript'
        })
      })
    )
  })

  test('marks the record failed at storage when persistence fails', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-3' })),
      update: vi.fn()
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: {
        save: vi.fn().mockRejectedValue(new Error('disk full'))
      } as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue({
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize: vi.fn().mockResolvedValue({
          text: 'raw transcript',
          segments: [{ text: 'raw transcript', isFinal: true }]
        })
      }),
      resolveActiveLLMSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'openai-codex',
          displayName: 'OpenAI Codex',
          isConfigured: () => true,
          listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
          generate: vi.fn().mockResolvedValue({
            content: 'Send the report by Friday.',
            finishReason: 'stop'
          })
        },
        model: 'gpt-5.2-codex'
      })
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(repository.update).toHaveBeenLastCalledWith(
      'record-3',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'storage',
        failureMessage: 'disk full'
      })
    )
  })

  test('marks the record failed at asr with empty transcript on failure', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-4' })),
      update: vi.fn()
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: {
        save: vi.fn().mockResolvedValue({ audioFilePath: '/recordings/four.wav' })
      } as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue({
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize: vi.fn().mockRejectedValue(new Error('asr timeout'))
      }),
      resolveActiveLLMSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'openai-codex',
          displayName: 'OpenAI Codex',
          isConfigured: () => true,
          listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
          generate: vi.fn().mockResolvedValue({
            content: 'Send the report by Friday.',
            finishReason: 'stop'
          })
        },
        model: 'gpt-5.2-codex'
      })
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(repository.update).toHaveBeenLastCalledWith(
      'record-4',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'asr',
        debug: expect.objectContaining({
          rawTranscriptionText: '',
          asrSegments: [],
          asrResponseSummary: { segmentCount: 0 }
        })
      })
    )
  })

  test('ignores error-attached recognition results on failure', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-5' })),
      update: vi.fn()
    }

    const error = Object.assign(new Error('asr timeout'), {
      result: {
        text: 'should be ignored',
        segments: [{ text: 'should be ignored', isFinal: true }]
      }
    })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: {
        save: vi.fn().mockResolvedValue({ audioFilePath: '/recordings/five.wav' })
      } as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue({
        id: 'deepgram',
        displayName: 'Deepgram',
        isConfigured: () => true,
        recognize: vi.fn().mockRejectedValue(error)
      }),
      resolveActiveLLMSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'openai-codex',
          displayName: 'OpenAI Codex',
          isConfigured: () => true,
          listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
          generate: vi.fn().mockResolvedValue({
            content: 'Send the report by Friday.',
            finishReason: 'stop'
          })
        },
        model: 'gpt-5.2-codex'
      })
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(repository.update).toHaveBeenLastCalledWith(
      'record-5',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'asr',
        debug: expect.objectContaining({
          rawTranscriptionText: '',
          asrSegments: [],
          asrResponseSummary: { segmentCount: 0 }
        })
      })
    )
  })
})
