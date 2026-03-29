import { describe, expect, test, vi } from 'vitest'
import { OpenAICodexOAuth } from '../auth/openai-codex-oauth'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn()
  }
}))

function createTokenResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      id_token: [
        'header',
        Buffer.from(JSON.stringify({ email: 'dev@example.com', sub: 'acct_123' })).toString(
          'base64url'
        ),
        'signature'
      ].join('.')
    })
  } satisfies Pick<Response, 'ok' | 'status' | 'json'>
}

describe('OpenAICodexOAuth', () => {
  test('derives redirectUri from the configured callback server settings', async () => {
    let openedUrl = ''
    const openExternal = vi.fn(async (url: string) => {
      openedUrl = url
    })
    let capturedRequestInit: RequestInit | undefined
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequestInit = init
      return createTokenResponse() as Response
    })
    const startCallbackServer = vi.fn(async () => ({ code: 'auth-code' }))
    const oauth = new OpenAICodexOAuth({
      callbackPathname: '/oauth/callback',
      callbackPort: 4321,
      fetchFn: fetchFn as unknown as typeof fetch,
      openExternal,
      startCallbackServer
    })

    await oauth.authorize()

    expect(openExternal).toHaveBeenCalledOnce()
    const authorizeUrl = new URL(openedUrl)
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4321/oauth/callback'
    )

    expect(fetchFn).toHaveBeenCalledOnce()
    const body = capturedRequestInit?.body
    expect(body).toBeInstanceOf(URLSearchParams)
    expect((body as URLSearchParams).get('redirect_uri')).toBe(
      'http://localhost:4321/oauth/callback'
    )
  })

  test('aborts the callback listener cleanly when opening the browser fails', async () => {
    const openExternal = vi.fn(async () => {
      throw new Error('browser unavailable')
    })
    const abortObserved = vi.fn()
    const startCallbackServer = vi.fn(({ signal }: { signal?: AbortSignal }) => {
      return new Promise<{ code: string }>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            abortObserved()
            reject(new Error('callback aborted'))
          },
          { once: true }
        )
      })
    })
    const oauth = new OpenAICodexOAuth({
      openExternal,
      startCallbackServer
    })

    await expect(oauth.authorize()).rejects.toThrow('browser unavailable')

    await Promise.resolve()
    expect(abortObserved).toHaveBeenCalledOnce()
  })
})
