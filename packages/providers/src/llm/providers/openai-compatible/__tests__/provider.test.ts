import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError } from '../../../../shared/errors.ts'
import { OpenAICompatibleLLMProvider } from '../provider.ts'

const createMock = vi.fn()
const listMock = vi.fn()
const openAIConstructorMock = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn(class MockOpenAI {
    constructor(config: unknown) {
      openAIConstructorMock(config)
    }

    chat = {
      completions: {
        create: createMock,
      },
    }
    models = {
      list: listMock,
    }
  }),
}))

describe('OpenAICompatibleLLMProvider', () => {
  beforeEach(() => {
    createMock.mockReset()
    listMock.mockReset()
    openAIConstructorMock.mockReset()
  })

  it('uses the OpenAI-compatible chat completions shape for generation', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: { content: 'hello' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 2,
        total_tokens: 5,
      },
    })

    const provider = new OpenAICompatibleLLMProvider({
      id: 'deepseek',
      displayName: 'DeepSeek',
      config: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.deepseek.com'
      }
    })

    await expect(provider.generate({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 42
    })).resolves.toEqual({
      content: 'hello',
      finishReason: 'stop',
      usage: {
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5
      }
    })

    expect(openAIConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'https://api.deepseek.com/v1',
        defaultHeaders: {
          'User-Agent': 'node'
        }
      })
    )
    expect(createMock).toHaveBeenCalledWith({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: undefined,
      max_tokens: 42,
      stream: false,
    }, { signal: undefined })
  })

  it('supports api, static, and none model list strategies', async () => {
    listMock.mockResolvedValue({
      data: [
        { id: 'z-model' },
        { id: 'a-model' }
      ]
    })

    const apiProvider = new OpenAICompatibleLLMProvider({
      id: 'api',
      displayName: 'API',
      config: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com/v1',
        modelListStrategy: 'api'
      }
    })
    await expect(apiProvider.listModels()).resolves.toEqual([
      { id: 'a-model', name: 'a-model' },
      { id: 'z-model', name: 'z-model' }
    ])

    const staticProvider = new OpenAICompatibleLLMProvider({
      id: 'static',
      displayName: 'Static',
      config: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com/v1',
        modelListStrategy: 'static'
      },
      staticModels: [
        { id: 'b', name: 'Beta' },
        { id: 'a', name: 'Alpha', contextWindow: 123 }
      ]
    })
    await expect(staticProvider.listModels()).resolves.toEqual([
      { id: 'a', name: 'Alpha', contextWindow: 123 },
      { id: 'b', name: 'Beta', contextWindow: undefined }
    ])

    const noneProvider = new OpenAICompatibleLLMProvider({
      id: 'none',
      displayName: 'None',
      config: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com/v1',
        modelListStrategy: 'none'
      }
    })
    await expect(noneProvider.listModels()).resolves.toEqual([])
  })

  it('allows optional API keys for local endpoints', () => {
    const provider = new OpenAICompatibleLLMProvider({
      id: 'ollama',
      displayName: 'Ollama',
      config: {
        baseUrl: 'http://localhost:11434/v1'
      },
      requiresApiKey: false
    })

    expect(provider.isConfigured()).toBe(true)
  })

  it('throws ConfigurationError when required API key is missing', async () => {
    const provider = new OpenAICompatibleLLMProvider({
      id: 'remote',
      displayName: 'Remote',
      config: {
        baseUrl: 'https://api.example.com/v1'
      }
    })

    await expect(provider.generate({
      model: 'model',
      messages: [{ role: 'user', content: 'hi' }]
    })).rejects.toBeInstanceOf(ConfigurationError)
  })
})
