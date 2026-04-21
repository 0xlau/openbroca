import { describe, expect, test, vi } from 'vitest'
import {
  createNormalizedCleanupPromptContextGetters,
  PostRecordingPipeline
} from '../post-recording-pipeline'

function createCompletedDeliveryResult(overrides: Record<string, unknown> = {}) {
  return {
    targetAppAtMatch: null,
    targetAppAtDelivery: {
      id: 'current-chat-window',
      displayName: 'ChatGPT',
      platform: 'macos',
      bundleId: 'com.openai.chat',
      source: 'detected'
    },
    matchedInstruction: {
      ruleId: 'rule-chat',
      name: 'Chat',
      autoEnterMode: 'enter'
    },
    instructionPromptApplied: true,
    ownershipMatchedAtDelivery: true,
    method: 'paste',
    status: 'completed',
    outcome: 'paste-success',
    pasteAttempted: true,
    autoSendTriggered: true,
    ...overrides
  }
}

describe('createNormalizedCleanupPromptContextGetters', () => {
  test('normalizes malformed raw dictionary/about-me values and prompt template from raw getters', () => {
    const getters = createNormalizedCleanupPromptContextGetters({
      getDictionaryRaw: () => ({
        entries: [
          null,
          { id: '', term: 'invalid-id' },
          { id: 'blank-term', term: '   ' },
          {
            id: 'hotword-1',
            term: '  OpenBroca  ',
            type: 'hotword',
            usageCount: 'invalid',
            createdAt: 100,
            updatedAt: null
          },
          {
            id: 'replace-1',
            term: '  broka  ',
            replacement: '  Broca  ',
            note: 123,
            usageCount: 5,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z'
          }
        ]
      }),
      getAboutMeRaw: () => ({
        nickname: '  Liu  ',
        email: 42,
        occupation: undefined,
        bio: '  ships voice tools  '
      }),
      getPromptsRaw: () => ({
        template: '  Keep {{about_me.nickname}}  '
      })
    } as never)

    expect(getters.getDictionarySettings()).toEqual({
      entries: [
        {
          id: 'hotword-1',
          term: 'OpenBroca',
          type: 'hotword',
          replacement: undefined,
          note: undefined,
          usageCount: 0,
          createdAt: '',
          updatedAt: ''
        },
        {
          id: 'replace-1',
          term: 'broka',
          type: undefined,
          replacement: 'Broca',
          note: undefined,
          usageCount: 5,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z'
        }
      ]
    })
    expect(getters.getAboutMeSettings()).toEqual({
      nickname: 'Liu',
      email: '',
      occupation: '',
      bio: 'ships voice tools'
    })
    expect((getters as never as { getPromptTemplateSettings: () => { template: string } }).getPromptTemplateSettings()).toEqual({
      template: '  Keep {{about_me.nickname}}  '
    })
  })
})

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
      resolveActiveASRSelection: vi
        .fn()
        .mockResolvedValue({ provider: asrProvider, settings: { language: 'zh' } }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })
    } as never)

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
      { language: 'zh' }
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

  test('builds cleanup system prompt by resolving dictionary and about-me placeholders', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-prompt-context' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/prompt-context.wav',
        fileName: 'prompt-context.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
      getDictionarySettings: () => ({
        entries: [
          {
            id: 'dict-1',
            term: 'openbroca',
            type: 'hotword',
            usageCount: 4,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z'
          },
          {
            id: 'dict-2',
            term: 'broka',
            type: 'replacement',
            replacement: 'Broca',
            note: 'Product name capitalization',
            usageCount: 2,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z'
          }
        ]
      }),
      getAboutMeSettings: () => ({
        nickname: 'Liu',
        email: 'liu@example.com',
        occupation: '',
        bio: 'Works on OpenBroca.'
      })
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(llmRequest?.messages[0]?.content).toContain('Dictionary:\nhotword:\n- openbroca')
    expect(llmRequest?.messages[0]?.content).toContain('replacement:\n- broka => Broca')
    expect(llmRequest?.messages[0]?.content).toContain(
      'notes:\n- broka: Product name capitalization'
    )
    expect(llmRequest?.messages[0]?.content).toContain('About the user:\nnickname: Liu')
    expect(llmRequest?.messages[0]?.content).toContain('Primary goal:')
    expect(llmRequest?.messages[0]?.content).toContain('Hard constraints:')
  })

  test('resolves empty dictionary/about-me state into default template placeholders', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-prompt-empty-context' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/prompt-empty-context.wav',
        fileName: 'prompt-empty-context.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
      getAboutMeSettings: () => ({
        nickname: '',
        email: '',
        occupation: '',
        bio: ''
      })
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(llmRequest?.messages[0]?.content).toContain('Dictionary:\nNone.')
    expect(llmRequest?.messages[0]?.content).toContain('About the user:\nNone.')
    expect(llmRequest?.messages[0]?.content).toContain('Matched app instructions:')
  })

  test('uses saved prompt template from pipeline getters and resolves placeholders at runtime', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-custom-template' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/custom-template.wav',
        fileName: 'custom-template.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const chatApp = {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      bundleId: 'com.openai.chat',
      source: 'detected'
    } as const

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: '  Use short chat-style replies.  ',
        autoEnterMode: 'off',
        activationApp: chatApp
      }),
      getDictionarySettings: () => ({
        entries: [
          {
            id: 'dict-1',
            term: 'openbroca',
            type: 'hotword',
            usageCount: 1,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z'
          }
        ]
      }),
      getAboutMeSettings: () => ({
        nickname: 'Liu',
        email: 'liu@example.com',
        occupation: 'Engineer',
        bio: ''
      }),
      getPromptTemplateSettings: () => ({
        template:
          'HOTWORDS={{dictionary.hotwords}} | NICK={{about_me.nickname}} | MATCHED={{matched_instructions}} | FUTURE={{raw_transcript}} | UNKNOWN={{unknown_placeholder}}'
      })
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot: chatApp
    })

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(llmRequest?.messages[0]?.content).toBe(
      'HOTWORDS=- openbroca | NICK=Liu | MATCHED=Use short chat-style replies. | FUTURE= | UNKNOWN='
    )
  })

  test('appends matched custom instructions only when prompt-time frontmost app still matches the rule app', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-prompt-app-match' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/prompt-app-match.wav',
        fileName: 'prompt-app-match.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const wechatApp = {
      id: 'com.tencent.xinWeChat',
      displayName: 'WeChat',
      platform: 'macos',
      bundleId: 'com.tencent.xinWeChat',
      source: 'detected'
    } as const
    const getTargetAppForPrompt = vi.fn().mockResolvedValue(wechatApp)
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue(createCompletedDeliveryResult())
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-wechat',
        name: 'WeChat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'off',
        activationApp: wechatApp
      }),
      getTargetAppForPrompt,
      finalTextDeliveryService
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot: wechatApp
    } as never)

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(getTargetAppForPrompt).toHaveBeenCalledTimes(1)
    expect(llmRequest?.messages[0]?.content).toContain('Matched app instructions:')
    expect(llmRequest?.messages[0]?.content).toContain('Use short chat-style replies.')
    expect(finalTextDeliveryService.deliver).toHaveBeenCalledWith({
      text: 'Send this now.',
      matchedInstruction: expect.objectContaining({
        ruleId: 'rule-wechat',
        autoEnterMode: 'off',
        activationApp: wechatApp
      }),
      targetAppAtMatch: wechatApp,
      instructionPromptApplied: true
    })
  })

  test('omits matched custom instructions when prompt-time frontmost app changed before prompt build', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-prompt-app-changed' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/prompt-app-changed.wav',
        fileName: 'prompt-app-changed.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const wechatApp = {
      id: 'com.tencent.xinWeChat',
      displayName: 'WeChat',
      platform: 'macos',
      bundleId: 'com.tencent.xinWeChat',
      source: 'detected'
    } as const
    const notesApp = {
      id: 'com.apple.Notes',
      displayName: 'Notes',
      platform: 'macos',
      bundleId: 'com.apple.Notes',
      source: 'detected'
    } as const
    const getTargetAppForPrompt = vi.fn().mockResolvedValue(notesApp)
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue(createCompletedDeliveryResult())
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-wechat',
        name: 'WeChat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'off',
        activationApp: wechatApp
      }),
      getTargetAppForPrompt,
      finalTextDeliveryService
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot: wechatApp
    } as never)

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(getTargetAppForPrompt).toHaveBeenCalledTimes(1)
    expect(llmRequest?.messages[0]?.content).not.toContain('Use short chat-style replies.')
    expect(finalTextDeliveryService.deliver).toHaveBeenCalledWith({
      text: 'Send this now.',
      matchedInstruction: expect.objectContaining({
        ruleId: 'rule-wechat',
        autoEnterMode: 'off',
        activationApp: wechatApp
      }),
      targetAppAtMatch: wechatApp,
      instructionPromptApplied: false
    })
  })

  test('falls back to target app at match when prompt-time app probe rejects', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-prompt-app-probe-rejects' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/prompt-app-probe-rejects.wav',
        fileName: 'prompt-app-probe-rejects.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const wechatApp = {
      id: 'com.tencent.xinWeChat',
      displayName: 'WeChat',
      platform: 'macos',
      bundleId: 'com.tencent.xinWeChat',
      source: 'detected'
    } as const
    const getTargetAppForPrompt = vi
      .fn<() => Promise<typeof wechatApp | null>>()
      .mockRejectedValue(new Error('frontmost-app probe failed'))

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-wechat',
        name: 'WeChat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'off',
        activationApp: wechatApp
      }),
      getTargetAppForPrompt
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot: wechatApp
    } as never)

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(getTargetAppForPrompt).toHaveBeenCalledTimes(1)
    expect(llmProvider.generate).toHaveBeenCalledTimes(1)
    expect(llmRequest?.messages[0]?.content).toContain('Use short chat-style replies.')
    expect(repository.update).toHaveBeenLastCalledWith(
      'record-prompt-app-probe-rejects',
      expect.objectContaining({
        status: 'completed',
        finalText: 'Send this now.'
      })
    )
  })

  test('does not call LLM when ASR returns only whitespace', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-blank-asr' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/blank-asr.wav',
        fileName: 'blank-asr.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: '  \n\t  ',
        segments: [{ text: '  \n\t  ', isFinal: true }]
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn()
    }
    const resolveActiveLLMSelection = vi
      .fn()
      .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(resolveActiveLLMSelection).not.toHaveBeenCalled()
    expect(llmProvider.generate).not.toHaveBeenCalled()
    expect(repository.update).toHaveBeenLastCalledWith(
      'record-blank-asr',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'asr',
        failureMessage: 'ASR returned empty transcript',
        debug: expect.objectContaining({
          rawTranscriptionText: '  \n\t  '
        })
      })
    )
  })

  test('short-circuits a pre-aborted run before storage and provider work', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-cancel-asr' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/cancel-asr.wav',
        fileName: 'cancel-asr.wav',
        byteLength: 64
      })
    }
    const controller = new AbortController()
    controller.abort()
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockImplementation(async (_input, options) => {
        expect(options).toEqual({
          language: 'en',
          signal: controller.signal
        })

        const error = new Error('Recognition aborted')
        error.name = 'AbortError'
        throw error
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn()
    }
    const resolveActiveLLMSelection = vi
      .fn()
      .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection
    } as never)

    await pipeline.process(
      {
        format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
        chunks: [new Uint8Array([1, 2])],
        startedAt: '2026-04-02T10:00:00.000Z',
        endedAt: '2026-04-02T10:00:01.000Z',
        durationMs: 1000
      },
      { signal: controller.signal }
    )

    const lastPatch = repository.update.mock.lastCall?.[1]

    expect(storage.save).not.toHaveBeenCalled()
    expect(asrProvider.recognize).not.toHaveBeenCalled()
    expect(repository.update).toHaveBeenCalledTimes(1)
    expect(resolveActiveLLMSelection).not.toHaveBeenCalled()
    expect(llmProvider.generate).not.toHaveBeenCalled()
    expect(lastPatch).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureStage: 'asr',
        failureMessage: 'Cancelled by user',
        debug: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              stage: 'asr',
              message: 'Cancelled by user'
            })
          ]),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              stage: 'asr',
              status: 'started'
            })
          ])
        })
      })
    )
  })

  test('marks the record as cancelled when ASR provider aborts after processing starts', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-provider-cancel-asr' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/provider-cancel-asr.wav',
        fileName: 'provider-cancel-asr.wav',
        byteLength: 64
      })
    }
    const controller = new AbortController()
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockImplementation(async (_input, options) => {
        options?.signal?.throwIfAborted?.()
        controller.abort()
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        throw error
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn()
    }
    const resolveActiveASRSelection = vi
      .fn()
      .mockResolvedValue({ provider: asrProvider, settings: {} })
    const resolveActiveLLMSelection = vi
      .fn()
      .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection,
      resolveActiveLLMSelection
    } as never)

    await pipeline.process(
      {
        format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
        chunks: [new Uint8Array([1, 2])],
        startedAt: '2026-04-02T10:00:00.000Z',
        endedAt: '2026-04-02T10:00:01.000Z',
        durationMs: 1000
      },
      { signal: controller.signal }
    )

    const lastPatch = repository.update.mock.lastCall?.[1]

    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(resolveActiveASRSelection).toHaveBeenCalledTimes(1)
    expect(asrProvider.recognize).toHaveBeenCalledTimes(1)
    expect(resolveActiveLLMSelection).not.toHaveBeenCalled()
    expect(llmProvider.generate).not.toHaveBeenCalled()
    expect(lastPatch).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureStage: 'asr',
        failureMessage: 'Cancelled by user',
        debug: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              stage: 'asr',
              message: 'Cancelled by user'
            })
          ]),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              stage: 'storage',
              status: 'completed'
            }),
            expect.objectContaining({
              stage: 'asr',
              status: 'started'
            }),
            expect.objectContaining({
              stage: 'asr',
              status: 'failed',
              message: 'Cancelled by user'
            })
          ])
        })
      })
    )
  })

  test('marks the record failed when LLM returns only whitespace', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-blank-llm' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/blank-llm.wav',
        fileName: 'blank-llm.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send the report by friday',
        segments: [{ text: 'send the report by friday', isFinal: true }]
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn().mockResolvedValue({
        content: '   \n',
        finishReason: 'stop',
        usage: { promptTokens: 12, completionTokens: 0, totalTokens: 12 }
      })
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    const lastPatch = repository.update.mock.lastCall?.[1]

    expect(lastPatch).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureStage: 'llm',
        failureMessage: 'LLM returned empty content',
        debug: expect.objectContaining({
          rawTranscriptionText: 'send the report by friday',
          llmRequest: expect.objectContaining({
            model: 'gpt-5.2-codex'
          })
        })
      })
    )
    expect(lastPatch?.finalText).toBeUndefined()
  })

  test('stores raw llm response details when llm generation fails after a nonstandard response', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-llm-shape-failure' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/llm-shape-failure.wav',
        fileName: 'llm-shape-failure.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send the report by friday',
        segments: [{ text: 'send the report by friday', isFinal: true }]
      })
    }
    const llmError = Object.assign(new Error('Unsupported OpenAI response shape'), {
      rawResponse: {
        output: [
          {
            content: [{ type: 'refusal', text: 'nope' }]
          }
        ]
      }
    })
    const llmProvider = {
      id: 'openai',
      displayName: 'OpenAI',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.4', name: 'gpt-5.4' }]),
      generate: vi.fn().mockRejectedValue(llmError)
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.4' })
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    const lastPatch = repository.update.mock.lastCall?.[1]

    expect(lastPatch).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureStage: 'llm',
        failureMessage: 'Unsupported OpenAI response shape',
        debug: expect.objectContaining({
          llmRequest: expect.objectContaining({
            model: 'gpt-5.4'
          }),
          llmResponseSummary: expect.objectContaining({
            rawResponse: {
              output: [
                {
                  content: [{ type: 'refusal', text: 'nope' }]
                }
              ]
            },
            parseError: 'Unsupported OpenAI response shape'
          })
        })
      })
    )
  })

  test('marks the record as cancelled when LLM provider aborts after ASR succeeds', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-cancel-llm' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/cancel-llm.wav',
        fileName: 'cancel-llm.wav',
        byteLength: 64
      })
    }
    const controller = new AbortController()
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send the report by friday',
        segments: [{ text: 'send the report by friday', isFinal: true }]
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn().mockImplementation(async (request) => {
        request.signal?.throwIfAborted?.()
        controller.abort()
        const error = new Error('Request canceled')
        error.name = 'CanceledError'
        ;(error as Error & { code?: string }).code = 'ERR_CANCELED'
        throw error
      })
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' })
    } as never)

    await pipeline.process(
      {
        format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
        chunks: [new Uint8Array([1, 2])],
        startedAt: '2026-04-02T10:00:00.000Z',
        endedAt: '2026-04-02T10:00:01.000Z',
        durationMs: 1000
      },
      { signal: controller.signal }
    )

    const lastPatch = repository.update.mock.lastCall?.[1]

    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(asrProvider.recognize).toHaveBeenCalledTimes(1)
    expect(llmProvider.generate).toHaveBeenCalledTimes(1)
    expect(lastPatch).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureStage: 'llm',
        failureMessage: 'Cancelled by user',
        debug: expect.objectContaining({
          rawTranscriptionText: 'send the report by friday',
          llmRequest: expect.objectContaining({
            model: 'gpt-5.2-codex'
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              stage: 'llm',
              message: 'Cancelled by user'
            })
          ]),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              stage: 'asr',
              status: 'completed'
            }),
            expect.objectContaining({
              stage: 'llm',
              status: 'started'
            }),
            expect.objectContaining({
              stage: 'llm',
              status: 'failed',
              message: 'Cancelled by user'
            })
          ])
        })
      })
    )
  })

  test('does not finalize as completed when cancelled after llm resolves and before auto enter', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-late-cancel-llm' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/late-cancel-llm.wav',
        fileName: 'late-cancel-llm.wav',
        byteLength: 64
      })
    }
    const controller = new AbortController()
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
    const llmProvider = {
      id: 'openai-codex',
      displayName: 'OpenAI Codex',
      isConfigured: () => true,
      listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' }]),
      generate: vi.fn().mockImplementation(async () => {
        queueMicrotask(() => controller.abort())
        return {
          content: 'Send this now.',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 }
        }
      })
    }
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue(createCompletedDeliveryResult())
    }
    const chatApp = {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      bundleId: 'com.openai.chat',
      source: 'detected'
    } as const

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'enter',
        activationApp: chatApp
      }),
      finalTextDeliveryService
    } as never)

    await pipeline.process(
      {
        format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
        chunks: [new Uint8Array([1, 2])],
        startedAt: '2026-04-02T10:00:00.000Z',
        endedAt: '2026-04-02T10:00:01.000Z',
        durationMs: 1000
      },
      { signal: controller.signal }
    )

    const lastPatch = repository.update.mock.lastCall?.[1]

    expect(finalTextDeliveryService.deliver).not.toHaveBeenCalled()
    expect(
      repository.update.mock.calls.some(([, patch]) => patch?.status === 'completed')
    ).toBe(false)
    expect(lastPatch).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureStage: 'llm',
        failureMessage: 'Cancelled by user',
        debug: expect.objectContaining({
          rawTranscriptionText: 'send this now',
          llmRequest: expect.objectContaining({
            model: 'gpt-5.2-codex',
            matchedInstruction: expect.objectContaining({
              ruleId: 'rule-chat',
              autoEnterMode: 'enter'
            })
          }),
          errors: expect.arrayContaining([
            expect.objectContaining({
              stage: 'llm',
              message: 'Cancelled by user'
            })
          ]),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              stage: 'asr',
              status: 'completed'
            }),
            expect.objectContaining({
              stage: 'llm',
              status: 'started'
            }),
            expect.objectContaining({
              stage: 'llm',
              status: 'failed',
              message: 'Cancelled by user'
            })
          ])
        })
      })
    )
  })

  test('records matched instruction metadata and triggers auto enter after success', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-auto-enter' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/auto-enter.wav',
        fileName: 'auto-enter.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue(createCompletedDeliveryResult())
    }
    const chatApp = {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      bundleId: 'com.openai.chat',
      source: 'detected'
    } as const

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'enter',
        activationApp: chatApp
      }),
      finalTextDeliveryService
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot: chatApp
    })

    const llmRequest = llmProvider.generate.mock.calls[0]?.[0]
    expect(llmRequest?.messages[0]?.content).toContain('Matched app instructions:')
    expect(llmRequest?.messages[0]?.content).toContain('Use short chat-style replies.')
    expect(finalTextDeliveryService.deliver).toHaveBeenCalledWith({
      text: 'Send this now.',
      matchedInstruction: expect.objectContaining({
        ruleId: 'rule-chat',
        autoEnterMode: 'enter'
      }),
      targetAppAtMatch: chatApp,
      instructionPromptApplied: true
    })

    expect(repository.update).toHaveBeenLastCalledWith(
      'record-auto-enter',
      expect.objectContaining({
        status: 'completed',
        debug: expect.objectContaining({
          delivery: expect.objectContaining({
            instructionPromptApplied: true,
            ownershipMatchedAtDelivery: true,
            method: 'paste',
            status: 'completed',
            outcome: 'paste-success',
            pasteAttempted: true,
            autoSendTriggered: true
          }),
          llmRequest: expect.objectContaining({
            matchedInstruction: expect.objectContaining({
              ruleId: 'rule-chat',
              autoEnterMode: 'enter'
            })
          })
        })
      })
    )
  })

  test('triggers auto enter with mod-enter mode when matched instruction mode is mod-enter', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-auto-enter-mod-enter' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/auto-enter-mod-enter.wav',
        fileName: 'auto-enter-mod-enter.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue(
        createCompletedDeliveryResult({
          matchedInstruction: {
            ruleId: 'rule-chat',
            name: 'Chat',
            autoEnterMode: 'mod-enter'
          }
        })
      )
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'mod-enter',
        activationApp: {
          id: 'com.openai.chat',
          displayName: 'ChatGPT',
          platform: 'macos',
          bundleId: 'com.openai.chat',
          source: 'detected'
        }
      }),
      finalTextDeliveryService
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(finalTextDeliveryService.deliver).toHaveBeenCalledWith({
      text: 'Send this now.',
      matchedInstruction: expect.objectContaining({
        ruleId: 'rule-chat',
        autoEnterMode: 'mod-enter'
      }),
      targetAppAtMatch: null,
      instructionPromptApplied: false
    })
  })

  test('does not trigger auto enter when matched instruction mode is off', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-auto-enter-disabled' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/auto-enter-disabled.wav',
        fileName: 'auto-enter-disabled.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const triggerAutoEnter = vi.fn().mockResolvedValue(undefined)

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'off'
      }),
      autoEnterService: {
        triggerAutoEnter
      }
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(triggerAutoEnter).not.toHaveBeenCalled()
  })

  test('does not trigger auto enter when no matched instruction exists', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-no-matched-instruction' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/no-match.wav',
        fileName: 'no-match.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const triggerAutoEnter = vi.fn().mockResolvedValue(undefined)

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue(null),
      autoEnterService: {
        triggerAutoEnter
      }
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(triggerAutoEnter).not.toHaveBeenCalled()
  })

  test('resolves matched instruction from recording target snapshot', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-snapshot' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/snapshot.wav',
        fileName: 'snapshot.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const resolveMatchedInstruction = vi.fn(async (app: { id?: string } | null) => {
      if (app?.id !== 'com.snapshot.app') {
        return null
      }
      return {
        ruleId: 'rule-snapshot',
        name: 'Snapshot Rule',
        customInstructions: 'Use snapshot instruction.',
        autoEnterMode: 'off'
      }
    })

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot: {
        id: 'com.snapshot.app',
        displayName: 'Snapshot',
        platform: 'macos',
        bundleId: 'com.snapshot.bundle',
        source: 'detected'
      }
    } as never)

    expect(resolveMatchedInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'com.snapshot.app',
        bundleId: 'com.snapshot.bundle'
      })
    )
    expect(repository.update).toHaveBeenLastCalledWith(
      'record-snapshot',
      expect.objectContaining({
        debug: expect.objectContaining({
          llmRequest: expect.objectContaining({
            matchedInstruction: expect.objectContaining({
              ruleId: 'rule-snapshot',
              customInstructions: 'Use snapshot instruction.'
            })
          })
        })
      })
    )
  })

  test('uses target app snapshot for instruction matching and persists delivery debug from the delivery service', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-target-app-delivery' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/target-app-delivery.wav',
        fileName: 'target-app-delivery.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const targetAppSnapshot = {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      bundleId: 'com.openai.chat',
      source: 'detected'
    } as const
    const resolveMatchedInstruction = vi.fn().mockResolvedValue({
      ruleId: 'rule-chat',
      name: 'Chat',
      customInstructions: 'Use short chat-style replies.',
      autoEnterMode: 'enter',
      activationApp: targetAppSnapshot
    })
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue(
        createCompletedDeliveryResult({
          targetAppAtMatch: targetAppSnapshot
        })
      )
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction,
      finalTextDeliveryService
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      frontmostAppSnapshot: {
        id: 'com.slack.desktop',
        displayName: 'Slack',
        platform: 'macos',
        bundleId: 'com.slack.desktop',
        source: 'detected'
      },
      targetAppSnapshot
    } as never)

    expect(resolveMatchedInstruction).toHaveBeenCalledWith(targetAppSnapshot)
    expect(finalTextDeliveryService.deliver).toHaveBeenCalledWith({
      text: 'Send this now.',
      matchedInstruction: expect.objectContaining({
        ruleId: 'rule-chat',
        autoEnterMode: 'enter',
        activationApp: targetAppSnapshot
      }),
      targetAppAtMatch: targetAppSnapshot,
      instructionPromptApplied: true
    })
    expect(repository.update).toHaveBeenLastCalledWith(
      'record-target-app-delivery',
      expect.objectContaining({
        status: 'completed',
        finalText: 'Send this now.',
        debug: expect.objectContaining({
          frontmostAppSnapshot: {
            id: 'com.slack.desktop',
            displayName: 'Slack',
            platform: 'macos',
            bundleId: 'com.slack.desktop',
            source: 'detected'
          },
          delivery: {
            targetAppAtMatch: targetAppSnapshot,
            targetAppAtDelivery: {
              id: 'current-chat-window',
              displayName: 'ChatGPT',
              platform: 'macos',
              bundleId: 'com.openai.chat',
              source: 'detected'
            },
            matchedInstruction: {
              ruleId: 'rule-chat',
              name: 'Chat',
              autoEnterMode: 'enter'
            },
            instructionPromptApplied: true,
            ownershipMatchedAtDelivery: true,
            method: 'paste',
            status: 'completed',
            outcome: 'paste-success',
            pasteAttempted: true,
            autoSendTriggered: true
          }
        })
      })
    )
  })

  test('records a schema-complete failed delivery when no delivery service is available', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-delivery-service-unavailable' })),
      update: vi.fn()
    }
    const storage = {
      save: vi.fn().mockResolvedValue({
        audioFilePath: '/recordings/delivery-service-unavailable.wav',
        fileName: 'delivery-service-unavailable.wav',
        byteLength: 64
      })
    }
    const asrProvider = {
      id: 'deepgram',
      displayName: 'Deepgram',
      isConfigured: () => true,
      recognize: vi.fn().mockResolvedValue({
        text: 'send this now',
        segments: [{ text: 'send this now', isFinal: true }]
      })
    }
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
    const targetAppSnapshot = {
      id: 'com.openai.chat',
      displayName: 'ChatGPT',
      platform: 'macos',
      bundleId: 'com.openai.chat',
      source: 'detected'
    } as const

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: storage as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
      resolveActiveLLMSelection: vi
        .fn()
        .mockResolvedValue({ provider: llmProvider, model: 'gpt-5.2-codex' }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'enter',
        activationApp: targetAppSnapshot
      })
    } as never)

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000,
      targetAppSnapshot
    } as never)

    expect(repository.update).toHaveBeenLastCalledWith(
      'record-delivery-service-unavailable',
      expect.objectContaining({
        status: 'completed',
        finalText: 'Send this now.',
        debug: expect.objectContaining({
          delivery: {
            targetAppAtMatch: targetAppSnapshot,
            targetAppAtDelivery: null,
            matchedInstruction: {
              ruleId: 'rule-chat',
              name: 'Chat',
              autoEnterMode: 'enter'
            },
            instructionPromptApplied: true,
            ownershipMatchedAtDelivery: false,
            method: 'pending',
            status: 'failed',
            outcome: 'delivery-failed',
            pasteAttempted: false,
            autoSendTriggered: false,
            failureMessage: 'service-unavailable',
            fallbackReason: 'service-unavailable'
          }
        })
      })
    )
  })

  test('does not trigger auto enter when llm stage fails after request construction', async () => {
    const repository = {
      create: vi.fn(() => ({ id: 'record-auto-enter-llm-failure' })),
      update: vi.fn()
    }
    const finalTextDeliveryService = {
      deliver: vi.fn().mockResolvedValue({
        targetAppAtMatch: null,
        targetAppAtDelivery: null,
        matchedInstruction: null,
        instructionPromptApplied: false,
        ownershipMatchedAtDelivery: false,
        method: 'clipboard',
        status: 'failed',
        outcome: 'delivery-failed',
        pasteAttempted: false,
        autoSendTriggered: false,
        failureMessage: 'service-unavailable',
        fallbackReason: 'service-unavailable'
      })
    }

    const pipeline = new PostRecordingPipeline({
      historyRepository: repository as never,
      recordingStorage: {
        save: vi.fn().mockResolvedValue({ audioFilePath: '/recordings/llm-failure.wav' })
      } as never,
      resolveActiveASRSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'deepgram',
          displayName: 'Deepgram',
          isConfigured: () => true,
          recognize: vi.fn().mockResolvedValue({
            text: 'raw transcript',
            segments: [{ text: 'raw transcript', isFinal: true }]
          })
        },
        settings: {}
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
      }),
      resolveMatchedInstruction: vi.fn().mockResolvedValue({
        ruleId: 'rule-chat',
        name: 'Chat',
        customInstructions: 'Use short chat-style replies.',
        autoEnterMode: 'enter'
      }),
      finalTextDeliveryService
    })

    await pipeline.process({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.000Z',
      durationMs: 1000
    })

    expect(finalTextDeliveryService.deliver).not.toHaveBeenCalled()
    expect(repository.update).toHaveBeenLastCalledWith(
      'record-auto-enter-llm-failure',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'llm',
        debug: expect.objectContaining({
          llmRequest: expect.objectContaining({
            model: 'gpt-5.2-codex'
          })
        })
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
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
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
      resolveActiveASRSelection: async () => ({ provider: asrProvider, settings: {} }),
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
      resolveActiveASRSelection: vi.fn().mockResolvedValue({ provider: asrProvider, settings: {} }),
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
      resolveActiveASRSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'deepgram',
          displayName: 'Deepgram',
          isConfigured: () => true,
          recognize: vi.fn().mockResolvedValue({
            text: 'raw transcript',
            segments: [{ text: 'raw transcript', isFinal: true }]
          })
        },
        settings: {}
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
      resolveActiveASRSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'deepgram',
          displayName: 'Deepgram',
          isConfigured: () => true,
          recognize: vi.fn().mockResolvedValue({
            text: 'raw transcript',
            segments: [{ text: 'raw transcript', isFinal: true }]
          })
        },
        settings: {}
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
      resolveActiveASRSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'deepgram',
          displayName: 'Deepgram',
          isConfigured: () => true,
          recognize: vi.fn().mockRejectedValue(new Error('asr timeout'))
        },
        settings: {}
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
      resolveActiveASRSelection: vi.fn().mockResolvedValue({
        provider: {
          id: 'deepgram',
          displayName: 'Deepgram',
          isConfigured: () => true,
          recognize: vi.fn().mockRejectedValue(error)
        },
        settings: {}
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
