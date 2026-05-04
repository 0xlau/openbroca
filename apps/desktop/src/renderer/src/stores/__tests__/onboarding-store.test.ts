// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../trpc/client', () => ({
  trpcClient: {
    store: {
      get: { query: vi.fn().mockResolvedValue(null) },
      set: { mutate: vi.fn().mockResolvedValue(undefined) },
      watch: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }
    }
  }
}))

describe('onboardingStore', () => {
  afterEach(() => {
    vi.resetModules()
  })

  test('markOnboardingComplete writes a numeric completedAt', async () => {
    const { trpcClient } = await import('../../trpc/client')
    const { markOnboardingComplete } = await import('../onboarding-store')

    await markOnboardingComplete()

    const setCall = (trpcClient.store.set.mutate as ReturnType<typeof vi.fn>).mock.calls.at(-1)
    expect(setCall?.[0]?.key).toBe('onboarding')
    expect(typeof setCall?.[0]?.value?.completedAt).toBe('number')
    expect(setCall?.[0]?.value?.completedAt).toBeGreaterThan(0)
  })
})
