import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError } from '../../../../shared/errors.ts'
import { OpenAILLMProvider } from '../provider.ts'

const createMock = vi.fn()
const listMock = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn(class MockOpenAI {
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

describe('OpenAILLMProvider', () => {
  beforeEach(() => {
    createMock.mockReset()
    listMock.mockReset()
  })

  it('generate uses the non-streaming OpenAI path and maps usage', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: { content: 'hello world' },
          finish_reason: 'length',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    })

    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' })
    const signal = new AbortController().signal
    const result = await provider.generate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.3,
      maxTokens: 42,
      signal,
    })

    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.3,
      max_tokens: 42,
      stream: false,
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

  it('generate normalizes non-length finish reasons to stop', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: { content: 'done' },
          finish_reason: 'tool_calls',
        },
      ],
    })

    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' })
    await expect(provider.generate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })).resolves.toEqual({
      content: 'done',
      finishReason: 'stop',
      usage: undefined,
    })
  })

  it('complete yields normalized streaming chunks', async () => {
    async function* stream() {
      yield {
        choices: [
          {
            delta: { content: 'hel' },
            finish_reason: null,
          },
        ],
      }
      yield {
        choices: [
          {
            delta: { content: 'lo' },
            finish_reason: 'tool_calls',
          },
        ],
      }
    }

    createMock.mockResolvedValue(stream())

    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' })
    const chunks = []
    for await (const chunk of provider.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(chunk)
    }

    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: undefined,
      max_tokens: undefined,
      stream: true,
    }, { signal: undefined })

    expect(chunks).toEqual([
      { delta: 'hel', finishReason: null },
      { delta: 'lo', finishReason: null },
    ])
  })

  it('generate throws ConfigurationError when unconfigured', async () => {
    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' })
    Reflect.set(provider as object, 'client', null)

    await expect(provider.generate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toBeInstanceOf(ConfigurationError)
  })

  it('complete throws ConfigurationError when unconfigured', async () => {
    const provider = new OpenAILLMProvider({ apiKey: 'sk-test' })
    Reflect.set(provider as object, 'client', null)

    const consume = async () => {
      for await (const _chunk of provider.complete({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        // consume
      }
    }

    await expect(consume()).rejects.toBeInstanceOf(ConfigurationError)
  })
})
