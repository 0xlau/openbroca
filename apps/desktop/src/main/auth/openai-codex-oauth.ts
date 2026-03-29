import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { shell } from 'electron'

const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CALLBACK_PORT = 1455
const CALLBACK_PATHNAME = '/auth/callback'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access']
const CALLBACK_TIMEOUT_MS = 2 * 60 * 1000

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  expiresAt?: string
  scope?: string
  idToken?: string
}

export interface OAuthAccount {
  email?: string
  accountId?: string
}

export interface OAuthSession {
  tokens: OAuthTokens
  account?: OAuthAccount
}

export interface OAuthAuthorizer {
  authorize(): Promise<OAuthSession>
  dispose?(): void | Promise<void>
}

interface CallbackPayload {
  code: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  id_token?: string
}

interface CallbackServerOptions {
  expectedState: string
  pathname: string
  port: number
  signal?: AbortSignal
  timeoutMs?: number
}

export interface OpenAICodexOAuthOptions {
  authorizeUrl?: string
  callbackPathname?: string
  callbackPort?: number
  clientId?: string
  fetchFn?: typeof fetch
  now?: () => Date
  openExternal?: (url: string) => Promise<void> | void
  originator?: string
  redirectUri?: string
  scopes?: string[]
  startCallbackServer?: (options: CallbackServerOptions) => Promise<CallbackPayload>
  tokenUrl?: string
}

function createRedirectUri(port: number, pathname: string): string {
  return `http://localhost:${port}${pathname}`
}

const CALLBACK_URL = createRedirectUri(CALLBACK_PORT, CALLBACK_PATHNAME)

function encodeBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createCodeVerifier(): string {
  return encodeBase64Url(randomBytes(48))
}

function createCodeChallenge(codeVerifier: string): string {
  return encodeBase64Url(createHash('sha256').update(codeVerifier).digest())
}

function createState(): string {
  return encodeBase64Url(randomBytes(32))
}

function sendHtmlResponse(
  response: ServerResponse,
  statusCode: number,
  title: string,
  body: string
) {
  response.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' })
  response.end(
    `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseIdToken(idToken?: string): OAuthAccount | undefined {
  if (!idToken) {
    return undefined
  }

  const [, payload] = idToken.split('.')
  if (!payload) {
    return undefined
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
      sub?: string
    }
    return {
      email: parsed.email,
      accountId: parsed.sub
    }
  } catch {
    return undefined
  }
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  options: Required<
    Pick<OpenAICodexOAuthOptions, 'clientId' | 'fetchFn' | 'redirectUri' | 'tokenUrl' | 'now'>
  >
): Promise<OAuthSession> {
  const response = await options.fetchFn(options.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      code_verifier: codeVerifier
    })
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}`)
  }

  const tokens = (await response.json()) as TokenResponse
  return {
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      idToken: tokens.id_token,
      expiresAt:
        typeof tokens.expires_in === 'number'
          ? new Date(options.now().getTime() + tokens.expires_in * 1000).toISOString()
          : undefined
    },
    account: parseIdToken(tokens.id_token)
  }
}

function handleCallbackRequest(
  request: IncomingMessage,
  response: ServerResponse,
  expectedState: string,
  pathname: string,
  resolve: (value: CallbackPayload) => void,
  reject: (reason?: unknown) => void
): boolean {
  const requestUrl = new URL(request.url ?? '/', CALLBACK_URL)
  if (request.method !== 'GET' || requestUrl.pathname !== pathname) {
    sendHtmlResponse(response, 404, 'Not found', '<p>Not found.</p>')
    return false
  }

  const error = requestUrl.searchParams.get('error')
  if (error) {
    const description = requestUrl.searchParams.get('error_description') ?? error
    sendHtmlResponse(response, 400, 'Authentication failed', `<p>${escapeHtml(description)}</p>`)
    reject(new Error(`OpenAI Codex OAuth failed: ${description}`))
    return true
  }

  const state = requestUrl.searchParams.get('state')
  if (state !== expectedState) {
    sendHtmlResponse(response, 400, 'Authentication failed', '<p>State validation failed.</p>')
    reject(new Error('OpenAI Codex OAuth state validation failed'))
    return true
  }

  const code = requestUrl.searchParams.get('code')
  if (!code) {
    sendHtmlResponse(response, 400, 'Authentication failed', '<p>Missing authorization code.</p>')
    reject(new Error('OpenAI Codex OAuth callback did not include a code'))
    return true
  }

  sendHtmlResponse(
    response,
    200,
    'Authentication complete',
    '<p>You can close this window and return to OpenBroca.</p>'
  )
  resolve({ code })
  return true
}

export async function waitForOAuthCallback({
  expectedState,
  pathname,
  port,
  signal,
  timeoutMs = CALLBACK_TIMEOUT_MS
}: CallbackServerOptions): Promise<CallbackPayload> {
  return new Promise<CallbackPayload>((resolve, reject) => {
    let settled = false
    const server = createServer((request, response) => {
      if (settled) {
        sendHtmlResponse(response, 409, 'Authentication in progress', '<p>Request ignored.</p>')
        return
      }

      const handled = handleCallbackRequest(
        request,
        response,
        expectedState,
        pathname,
        resolveOnce,
        rejectOnce
      )
      if (handled) {
        cleanup()
      }
    })

    const resolveOnce = (value: CallbackPayload) => {
      if (settled) {
        return
      }
      settled = true
      resolve(value)
    }

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }

    const timeout = setTimeout(() => {
      rejectOnce(new Error('OpenAI Codex OAuth callback timed out'))
      cleanup()
    }, timeoutMs)

    const abortHandler = () => {
      rejectOnce(new Error('OpenAI Codex OAuth was cancelled'))
      cleanup()
    }

    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortHandler)
      if (server.listening) {
        void new Promise<void>((closeResolve) => {
          server.close(() => closeResolve())
        })
      }
    }

    server.once('error', (error) => {
      rejectOnce(error)
      cleanup()
    })

    if (signal?.aborted) {
      abortHandler()
      return
    }

    signal?.addEventListener('abort', abortHandler, { once: true })

    server.listen(port, 'localhost')
  })
}

export class OpenAICodexOAuth implements OAuthAuthorizer {
  private activeAuthorization?: AbortController

  private readonly authorizeUrl: string
  private readonly callbackPathname: string
  private readonly callbackPort: number
  private readonly clientId: string
  private readonly fetchFn: typeof fetch
  private readonly now: () => Date
  private readonly openExternal: (url: string) => Promise<void> | void
  private readonly originator: string
  private readonly redirectUri: string
  private readonly scopes: string[]
  private readonly startCallbackServer: (options: CallbackServerOptions) => Promise<CallbackPayload>
  private readonly tokenUrl: string

  constructor(options: OpenAICodexOAuthOptions = {}) {
    this.authorizeUrl = options.authorizeUrl ?? AUTHORIZE_URL
    this.callbackPathname = options.callbackPathname ?? CALLBACK_PATHNAME
    this.callbackPort = options.callbackPort ?? CALLBACK_PORT
    this.clientId = options.clientId ?? OPENAI_CODEX_CLIENT_ID
    this.fetchFn = options.fetchFn ?? fetch
    this.now = options.now ?? (() => new Date())
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url))
    this.originator = options.originator ?? 'codex_vscode'
    this.redirectUri =
      options.redirectUri ?? createRedirectUri(this.callbackPort, this.callbackPathname)
    this.scopes = options.scopes ?? DEFAULT_SCOPES
    this.startCallbackServer = options.startCallbackServer ?? waitForOAuthCallback
    this.tokenUrl = options.tokenUrl ?? TOKEN_URL
  }

  async authorize(): Promise<OAuthSession> {
    if (this.activeAuthorization) {
      throw new Error('OpenAI Codex OAuth is already in progress')
    }

    const state = createState()
    const codeVerifier = createCodeVerifier()
    const codeChallenge = createCodeChallenge(codeVerifier)
    const controller = new AbortController()
    this.activeAuthorization = controller
    let callbackPromise: Promise<CallbackPayload> | undefined

    const authorizeUrl = new URL(this.authorizeUrl)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', this.clientId)
    authorizeUrl.searchParams.set('redirect_uri', this.redirectUri)
    authorizeUrl.searchParams.set('scope', this.scopes.join(' '))
    authorizeUrl.searchParams.set('code_challenge', codeChallenge)
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')
    authorizeUrl.searchParams.set('id_token_add_organizations', 'true')
    authorizeUrl.searchParams.set('codex_cli_simplified_flow', 'true')
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('originator', this.originator)

    try {
      callbackPromise = this.startCallbackServer({
        expectedState: state,
        pathname: this.callbackPathname,
        port: this.callbackPort,
        signal: controller.signal
      })
      await this.openExternal(authorizeUrl.toString())
      const callback = await callbackPromise
      return exchangeCodeForTokens(callback.code, codeVerifier, {
        clientId: this.clientId,
        fetchFn: this.fetchFn,
        redirectUri: this.redirectUri,
        tokenUrl: this.tokenUrl,
        now: this.now
      })
    } catch (error) {
      controller.abort()
      await callbackPromise?.catch(() => undefined)
      throw error
    } finally {
      controller.abort()
      this.activeAuthorization = undefined
    }
  }

  dispose(): void {
    this.activeAuthorization?.abort()
    this.activeAuthorization = undefined
  }
}

export const openaiCodexOAuth = new OpenAICodexOAuth()
