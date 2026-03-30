import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError } from '../../../../shared/errors.ts'
import { OpenAICodexLLMProvider } from '../provider.ts'

function createAccessToken(accountId = 'acct_123'): string {
  return [
    'header',
    Buffer.from(
      JSON.stringify({
        sub: 'user_123',
        'https://api.openai.com/auth': {
          chatgpt_account_id: accountId
        }
      })
    ).toString('base64url'),
    'signature'
  ].join('.')
}

function createEventStreamResponse(events: unknown[]): Response {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(payload, {
    headers: {
      'content-type': 'text/event-stream'
    },
    status: 200
  })
}

describe('OpenAICodexLLMProvider', () => {
  const fetchFn = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchFn.mockReset()
  })

  it('listModels returns the supported Codex model catalog', async () => {
    const provider = new OpenAICodexLLMProvider({
      accessToken: createAccessToken(),
      fetchFn
    })

    await expect(provider.listModels()).resolves.toEqual([
      { id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' },
      { id: 'gpt-5.2', name: 'gpt-5.2' },
      { id: 'gpt-5.1-codex', name: 'gpt-5.1-codex' },
      { id: 'gpt-5.1-codex-mini', name: 'gpt-5.1-codex-mini' },
      { id: 'gpt-5.1-codex-max', name: 'gpt-5.1-codex-max' },
      { id: 'gpt-5.1', name: 'gpt-5.1' }
    ])
  })

  it('generate sends a non-streaming responses request and maps the completed result', async () => {
    fetchFn.mockResolvedValue(
      createEventStreamResponse([
        {
          type: 'response.completed',
          response: {
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: 'hello from codex'
                  }
                ]
              }
            ],
            usage: {
              input_tokens: 12,
              output_tokens: 7,
              total_tokens: 19
            }
          }
        }
      ])
    )

    const provider = new OpenAICodexLLMProvider({
      accessToken: createAccessToken('acct_codex'),
      fetchFn
    })

    const result = await provider.generate({
      model: 'gpt-5.2-codex',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Say hello' }
      ],
      maxTokens: 64,
      temperature: 0.1
    })

    expect(result).toEqual({
      content: 'hello from codex',
      finishReason: 'stop',
      usage: {
        promptTokens: 12,
        completionTokens: 7,
        totalTokens: 19
      }
    })

    expect(fetchFn).toHaveBeenCalledOnce()
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${createAccessToken('acct_codex')}`,
      'chatgpt-account-id': 'acct_codex',
      'openai-beta': 'responses=experimental'
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'gpt-5.2-codex',
      store: false,
      stream: false,
      max_output_tokens: 64,
      temperature: 0.1,
      input: [
        {
          type: 'message',
          role: 'developer'
        },
        {
          type: 'message',
          role: 'user'
        }
      ]
    })
  })

  it('complete streams response.output_text.delta events and emits the finish reason at the end', async () => {
    fetchFn.mockResolvedValue(
      createEventStreamResponse([
        {
          type: 'response.output_text.delta',
          delta: 'hello '
        },
        {
          type: 'response.output_text.delta',
          delta: 'world'
        },
        {
          type: 'response.completed',
          response: {
            output: [],
            incomplete_details: {
              reason: 'max_output_tokens'
            }
          }
        }
      ])
    )

    const provider = new OpenAICodexLLMProvider({
      accessToken: createAccessToken(),
      fetchFn
    })

    const chunks = []
    for await (const chunk of provider.complete({
      model: 'gpt-5.2-codex',
      messages: [{ role: 'user', content: 'stream please' }]
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'hello ', finishReason: null },
      { delta: 'world', finishReason: null },
      { delta: '', finishReason: 'length' }
    ])
  })

  it('throws ConfigurationError when runtime methods are used without oauth credentials', async () => {
    const provider = new OpenAICodexLLMProvider({})

    await expect(provider.generate({ model: 'gpt-5.2-codex', messages: [] })).rejects.toBeInstanceOf(
      ConfigurationError
    )
    await expect(provider.listModels()).rejects.toBeInstanceOf(ConfigurationError)
    await expect(async () => {
      for await (const _chunk of provider.complete({ model: 'gpt-5.2-codex', messages: [] })) {
        // consume
      }
    }).rejects.toBeInstanceOf(ConfigurationError)
  })
})
