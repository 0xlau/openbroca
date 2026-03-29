import { describe, expect, test, vi } from 'vitest'
import type { Context } from '../trpc/context'
import { providerAuthRouter } from '../trpc/routers/provider-auth'

describe('providerAuthRouter', () => {
  test('returns only non-sensitive auth metadata for a provider', async () => {
    const getStatus = vi.fn(async () => ({
      providerId: 'openai-codex',
      status: 'connected' as const,
      account: {
        email: 'dev@example.com',
        accountId: 'acct_123'
      },
      lastConnectedAt: '2026-03-28T12:00:00.000Z'
    }))

    const caller = providerAuthRouter.createCaller({
      oauthService: {
        getStatus,
        start: vi.fn(),
        disconnect: vi.fn(),
        dispose: vi.fn()
      }
    } as unknown as Context)

    const result = await caller.status({ providerId: 'openai-codex' })

    expect(getStatus).toHaveBeenCalledWith('openai-codex')
    expect(result).toEqual({
      providerId: 'openai-codex',
      status: 'connected',
      account: {
        email: 'dev@example.com',
        accountId: 'acct_123'
      },
      lastConnectedAt: '2026-03-28T12:00:00.000Z'
    })
    expect(JSON.stringify(result)).not.toContain('accessToken')
    expect(JSON.stringify(result)).not.toContain('refreshToken')
  })
})
