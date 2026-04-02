import { describe, expect, test, vi } from 'vitest'
import { PostRecordingPipeline } from '../post-recording-pipeline'

function iterableOf(chunks: Uint8Array[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    }
  }
}

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
      transcribe: vi.fn(() =>
        iterableOf([]) as unknown as AsyncIterable<{ text: string; isFinal: boolean }>
      )
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

    asrProvider.transcribe.mockReturnValue((async function* () {
      yield { text: 'send the report by friday', isFinal: true }
    })())

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue(asrProvider),
      resolveActiveLLMProvider: vi.fn().mockResolvedValue(llmProvider),
      selectLLMModel: vi.fn().mockResolvedValue('gpt-5.2-codex')
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

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

  test('builds the LLM transcript from final ASR segments only', async () => {
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
      transcribe: vi.fn()
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

    asrProvider.transcribe.mockReturnValue((async function* () {
      yield { text: 'send the', isFinal: false }
      yield { text: 'send the report', isFinal: true }
      yield { text: 'by', isFinal: false }
      yield { text: 'by friday', isFinal: true }
    })())

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRProvider: vi.fn().mockResolvedValue(asrProvider),
      resolveActiveLLMProvider: vi.fn().mockResolvedValue(llmProvider),
      selectLLMModel: vi.fn().mockResolvedValue('gpt-5.2-codex')
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
      transcribe: vi.fn(async function* (audio: AsyncIterable<Uint8Array>) {
        for await (const chunk of audio) {
          capturedAudio.push(chunk)
        }
        yield { text: 'hello world', isFinal: true }
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
      resolveActiveLLMProvider: vi.fn().mockResolvedValue(llmProvider),
      selectLLMModel: vi.fn().mockResolvedValue('gpt-5.2-codex')
    })

    await pipeline.process({
      format: { sampleRate: 48000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array(inputSamples48k.buffer.slice(0))],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

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
        transcribe: () =>
          (async function* () {
            yield { text: 'raw transcript', isFinal: true }
          })()
      }),
      resolveActiveLLMProvider: vi.fn().mockResolvedValue({
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        isConfigured: () => true,
        listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
        generate: vi.fn().mockRejectedValue(new Error('upstream 500'))
      }),
      selectLLMModel: vi.fn().mockResolvedValue('gpt-5.2-codex')
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
        transcribe: () =>
          (async function* () {
            yield { text: 'raw transcript', isFinal: true }
          })()
      }),
      resolveActiveLLMProvider: vi.fn().mockResolvedValue({
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        isConfigured: () => true,
        listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
        generate: vi.fn().mockResolvedValue({
          content: 'Send the report by Friday.',
          finishReason: 'stop'
        })
      }),
      selectLLMModel: vi.fn().mockResolvedValue('gpt-5.2-codex')
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

  test('marks the record failed at asr and preserves partial transcript on failure', async () => {
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
        transcribe: () =>
          (async function* () {
            yield { text: 'first segment', isFinal: true }
            throw new Error('asr timeout')
          })()
      }),
      resolveActiveLLMProvider: vi.fn().mockResolvedValue({
        id: 'openai-codex',
        displayName: 'OpenAI Codex',
        isConfigured: () => true,
        listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
        generate: vi.fn().mockResolvedValue({
          content: 'Send the report by Friday.',
          finishReason: 'stop'
        })
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
          rawTranscriptionText: 'first segment',
          asrSegments: [{ text: 'first segment', isFinal: true }],
          asrResponseSummary: { segmentCount: 1 }
        })
      })
    )
  })
})
