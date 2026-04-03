import { describe, expect, test } from 'vitest'
import type { Context } from '../../context'
import { storeRouter } from '../store'

class MemoryStore {
  store: Record<string, unknown>

  constructor(initial: Record<string, unknown> = {}) {
    this.store = { ...initial }
  }

  get<T>(key: string): T | undefined {
    return this.store[key] as T | undefined
  }

  set(key: string, value: unknown): void {
    this.store[key] = value
  }

  delete(key: string): void {
    delete this.store[key]
  }

  onDidChange(): () => void {
    return () => undefined
  }
}

describe('storeRouter', () => {
  test('rejects access to voice history in the generic store router', async () => {
    const store = new MemoryStore({ voiceHistory: { records: [] } })
    const caller = storeRouter.createCaller({ store } as unknown as Context)

    await expect(caller.get({ key: 'voiceHistory' })).rejects.toThrowError(
      'Store key not allowed: voiceHistory'
    )
    await expect(
      caller.set({ key: 'voiceHistory', value: { records: [] } })
    ).rejects.toThrowError('Store key not allowed: voiceHistory')
  })

  test('allows access to safe store keys', async () => {
    const store = new MemoryStore()
    const caller = storeRouter.createCaller({ store } as unknown as Context)

    await caller.set({ key: 'settings', value: { theme: 'light' } })
    await caller.set({
      key: 'instructions',
      value: {
        rules: [
          {
            id: 'rule-coding',
            name: 'Coding',
            activationApps: [
              {
                id: 'com.todesktop.230313mzl4w4u92',
                displayName: 'Cursor',
                platform: 'macos',
                source: 'detected'
              }
            ],
            customInstructions: 'Stay concise',
            autoEnter: true
          }
        ]
      }
    })

    await expect(caller.get({ key: 'settings' })).resolves.toEqual({ theme: 'light' })
    await expect(caller.get({ key: 'instructions' })).resolves.toEqual({
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding',
          activationApps: [
            {
              id: 'com.todesktop.230313mzl4w4u92',
              displayName: 'Cursor',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Stay concise',
          autoEnter: true
        }
      ]
    })
  })
})
