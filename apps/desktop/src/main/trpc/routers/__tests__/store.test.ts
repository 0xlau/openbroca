import { callTRPCProcedure } from '@trpc/server'
import { describe, expect, test, vi } from 'vitest'
import type { Context } from '../../context'
import { storeRouter } from '../store'

class MemoryStore {
  store: Record<string, unknown>
  private listeners = new Map<string, Set<(newValue: unknown) => void>>()

  constructor(initial: Record<string, unknown> = {}) {
    this.store = { ...initial }
  }

  get<T>(key: string): T | undefined {
    return this.store[key] as T | undefined
  }

  set(key: string, value: unknown): void {
    this.store[key] = value
    this.emitChange(key, value)
  }

  delete(key: string): void {
    delete this.store[key]
  }

  onDidChange(key: string, listener: (newValue: unknown) => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set<(newValue: unknown) => void>()
    listeners.add(listener)
    this.listeners.set(key, listeners)

    return () => {
      const active = this.listeners.get(key)
      if (!active) {
        return
      }
      active.delete(listener)
      if (active.size === 0) {
        this.listeners.delete(key)
      }
    }
  }

  emitChange(key: string, value: unknown): void {
    const listeners = this.listeners.get(key)
    if (!listeners) {
      return
    }
    for (const listener of listeners) {
      listener(value)
    }
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
    await caller.set({ key: 'prompts', value: { template: 'Keep this exactly' } })
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
    await expect(caller.get({ key: 'prompts' })).resolves.toEqual({ template: 'Keep this exactly' })
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
          autoEnterMode: 'enter'
        }
      ]
    })
  })

  test('normalizes malformed instructions payloads on write while preserving generic writes for other keys', async () => {
    const store = new MemoryStore()
    const caller = storeRouter.createCaller({ store } as unknown as Context)

    await caller.set({ key: 'settings', value: { theme: 'system', nested: { preserve: true } } })
    await caller.set({
      key: 'instructions',
      value: {
        rules: [
          {
            id: 'rule-coding',
            name: '  Coding  ',
            activationApps: [
              {
                id: 'com.todesktop.230313mzl4w4u92',
                displayName: 'Cursor',
                platform: 'macos',
                source: 'detected'
              },
              {
                id: '   ',
                displayName: 'Invalid App',
                platform: 'macos',
                source: 'detected'
              }
            ],
            customInstructions: 123,
            autoEnter: 'truthy'
          },
          {
            id: 'rule-empty',
            name: '   ',
            activationApps: [
              {
                id: 'company.thebrowser.Browser',
                displayName: 'Arc',
                platform: 'macos',
                source: 'detected'
              }
            ],
            customInstructions: 'Should be dropped',
            autoEnter: true
          },
          {
            id: 'rule-writing',
            name: 'Writing',
            activationApps: [
              {
                id: 'com.todesktop.230313mzl4w4u92',
                displayName: 'Cursor Duplicate',
                platform: 'macos',
                source: 'detected'
              },
              {
                id: 'company.thebrowser.Browser',
                displayName: 'Arc',
                platform: 'macos',
                source: 'detected'
              }
            ],
            customInstructions: 'Summarize clearly',
            autoEnter: 0
          }
        ]
      }
    })

    await expect(caller.get({ key: 'settings' })).resolves.toEqual({
      theme: 'system',
      nested: { preserve: true }
    })
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
          customInstructions: '',
          autoEnterMode: 'off'
        },
        {
          id: 'rule-writing',
          name: 'Writing',
          activationApps: [
            {
              id: 'company.thebrowser.Browser',
              displayName: 'Arc',
              platform: 'macos',
              source: 'detected'
            }
          ],
          customInstructions: 'Summarize clearly',
          autoEnterMode: 'off'
        }
      ]
    })
  })

  test('normalizes about me and dictionary payloads on write', async () => {
    const store = new MemoryStore()
    const caller = storeRouter.createCaller({ store } as unknown as Context)

    await caller.set({
      key: 'aboutMe',
      value: {
        nickname: '  Peiqiang  ',
        email: 123,
        occupation: ' Engineer ',
        bio: null
      }
    })

    await caller.set({
      key: 'dictionary',
      value: {
        entries: [
          {
            id: ' entry-1 ',
            term: ' Open Broca ',
            type: 'replacement',
            replacement: ' OpenBroca ',
            note: ' frequent typo ',
            usageCount: 2
          },
          {
            id: '   ',
            term: 'drop-blank-id'
          },
          {
            term: 'drop-missing-id'
          },
          {
            id: 42,
            term: 'drop-non-string-id'
          },
          {
            id: 'entry-2',
            term: '   '
          }
        ]
      }
    })

    await expect(caller.get({ key: 'aboutMe' })).resolves.toEqual({
      nickname: 'Peiqiang',
      email: '',
      occupation: 'Engineer',
      bio: ''
    })

    await expect(caller.get({ key: 'dictionary' })).resolves.toEqual({
      entries: [
        {
          id: 'entry-1',
          term: 'Open Broca',
          type: 'replacement',
          replacement: 'OpenBroca',
          note: 'frequent typo',
          usageCount: 2,
          createdAt: '',
          updatedAt: ''
        }
      ]
    })
  })

  test('normalizes prompt template payloads while preserving template whitespace', async () => {
    const store = new MemoryStore()
    const caller = storeRouter.createCaller({ store } as unknown as Context)

    await caller.set({
      key: 'prompts',
      value: {
        template: '  Keep leading and trailing spaces  '
      }
    })

    await expect(caller.get({ key: 'prompts' })).resolves.toEqual({
      template: '  Keep leading and trailing spaces  '
    })

    await caller.set({
      key: 'prompts',
      value: {
        template: 123
      }
    })

    await expect(caller.get({ key: 'prompts' })).resolves.toEqual({
      template: ''
    })
  })

  test('watch yields store changes and aborts without leaving stale abort listeners', async () => {
    const store = new MemoryStore()
    const controller = new AbortController()
    const addEventListenerSpy = vi.spyOn(controller.signal, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener')

    const result = await callTRPCProcedure({
      router: storeRouter,
      path: 'watch',
      getRawInput: async () => ({ key: 'settings' }),
      ctx: { store } as unknown as Context,
      type: 'subscription',
      signal: controller.signal,
      batchIndex: 0
    })

    const iterator = (result as AsyncIterable<unknown>)[Symbol.asyncIterator]()
    const firstNext = iterator.next()
    await Promise.resolve()

    store.emitChange('settings', { theme: 'dark' })

    await expect(firstNext).resolves.toEqual({
      value: { theme: 'dark' },
      done: false
    })

    expect(addEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true })
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(1)

    const secondNext = iterator.next()
    controller.abort()

    await expect(secondNext).resolves.toEqual({
      value: undefined,
      done: true
    })
  })
})
