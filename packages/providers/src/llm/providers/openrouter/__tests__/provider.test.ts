import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError } from '../../../../shared/errors.ts'
import type { CompletionRequest } from '../../../contracts.ts'
import { OpenRouterLLMProvider } from '../provider.ts'

const listForUserMock = vi.fn()
const chatSendMock = vi.fn()

vi.mock('@openrouter/sdk', () => ({
  OpenRouter: vi.fn(class MockOpenRouter {
    models = {
      listForUser: listForUserMock,
    }

    chat = {
      send: chatSendMock,
    }
  }),
}))

describe('OpenRouterLLMProvider', () => {
  beforeEach(() => {
    listForUserMock.mockReset()
    chatSendMock.mockReset()
  })

  it('listModels() maps user-filtered models to stable LLMModel[]', async () => {
    listForUserMock.mockResolvedValue({
      data: [
        { id: 'm-b', name: 'Zeta', contextLength: 8_192 },
        { id: 'm-c', name: 'Alpha', contextLength: 4_096 },
        { id: 'm-a', name: 'Alpha', contextLength: null },
        { id: 'm-d', name: '', contextLength: 1_024 },
      ],
    })

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    const signal = new AbortController().signal
    const models = await provider.listModels(signal)

    expect(listForUserMock).toHaveBeenCalledWith(
      { bearer: 'or-key' },
      undefined,
      { signal },
    )

    expect(models).toEqual([
      { id: 'm-a', name: 'Alpha', contextWindow: undefined },
      { id: 'm-c', name: 'Alpha', contextWindow: 4_096 },
      { id: 'm-b', name: 'Zeta', contextWindow: 8_192 },
      { id: 'm-d', name: 'm-d', contextWindow: 1_024 },
    ])
  })

  it('generate() maps a non-streaming result into CompletionResult', async () => {
    chatSendMock.mockResolvedValue({
      choices: [
        {
          message: { content: 'hello world' },
          finishReason: 'length',
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    })

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    const signal = new AbortController().signal
    const result = await provider.generate({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.3,
      maxTokens: 42,
      signal,
    })

    expect(chatSendMock).toHaveBeenCalledWith({
      chatRequest: {
        stream: false,
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.3,
        maxTokens: 42,
      },
    }, { signal })

    expect(result).toEqual({
      content: 'hello world',
      finishReason: 'length',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    })
  })

  it('generate() extracts text from structured assistant content arrays', async () => {
    chatSendMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: 'hello ' },
              { type: 'text', text: 'world' },
              { type: 'image', imageUrl: 'https://example.com/x.png' },
            ],
          },
          finishReason: 'stop',
        },
      ],
    })

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    const result = await provider.generate({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result).toEqual({
      content: 'hello world',
      finishReason: 'stop',
      usage: undefined,
    })
  })

  it('complete() yields streaming deltas and a terminal chunk', async () => {
    async function* stream() {
      yield {
        choices: [
          {
            delta: { content: 'hel' },
            finishReason: null,
          },
        ],
      }
      yield {
        choices: [
          {
            delta: { content: 'lo' },
            finishReason: 'stop',
          },
        ],
      }
    }

    chatSendMock.mockResolvedValue(stream())

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    const chunks = []
    for await (const chunk of provider.complete({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(chunk)
    }

    expect(chatSendMock).toHaveBeenCalledWith({
      chatRequest: {
        stream: true,
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: undefined,
        maxTokens: undefined,
      },
    }, { signal: undefined })

    expect(chunks).toEqual([
      { delta: 'hel', finishReason: null },
      { delta: 'lo', finishReason: null },
      { delta: '', finishReason: 'stop' },
    ])
  })

  it('complete() throws if the SDK stream surfaces an error object', async () => {
    async function* stream() {
      yield {
        error: { message: 'unauthorized', code: 401 },
        choices: [],
      }
    }

    chatSendMock.mockResolvedValue(stream())

    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })
    const consume = async () => {
      for await (const _chunk of provider.complete({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        // consume
      }
    }

    await expect(consume()).rejects.toMatchObject({
      message: expect.stringContaining('unauthorized'),
      code: 401,
    })
  })

  it('unconfigured provider usage throws ConfigurationError', async () => {
    const provider = new OpenRouterLLMProvider({ apiKey: '   ' })
    const request: CompletionRequest = {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    }

    await expect(provider.listModels()).rejects.toBeInstanceOf(ConfigurationError)
    await expect(provider.generate(request)).rejects.toBeInstanceOf(ConfigurationError)

    const consume = async () => {
      for await (const _chunk of provider.complete(request)) {
        // consume
      }
    }
    await expect(consume()).rejects.toBeInstanceOf(ConfigurationError)
  })

  it('SDK request failures are preserved', async () => {
    const provider = new OpenRouterLLMProvider({ apiKey: 'or-key' })

    const listErr = new Error('models down')
    listForUserMock.mockRejectedValueOnce(listErr)
    await expect(provider.listModels()).rejects.toBe(listErr)

    const genErr = new Error('chat down')
    chatSendMock.mockRejectedValueOnce(genErr)
    await expect(provider.generate({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toBe(genErr)
  })
})
