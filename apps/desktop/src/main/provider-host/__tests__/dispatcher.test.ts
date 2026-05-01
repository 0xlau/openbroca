import { describe, expect, it } from 'vitest'
import { ASRProviderRegistry } from '@openbroca/providers/asr'
import { LLMProviderRegistry } from '@openbroca/providers/llm'
import { ConfigurationError } from '@openbroca/providers'
import { ChildDispatcher } from '../child/dispatcher'
import type { ChildRegistries } from '../child/registries'
import type { ChildResponse } from '../protocol'
import { SIGNAL_SLOT_MARKER } from '../protocol'

function makeStubASRRegistries(create: () => unknown): ChildRegistries {
  const asr = new ASRProviderRegistry()
  asr.register({
    id: 'stub',
    displayName: 'Stub ASR',
    description: '',
    kind: 'cloud',
    configSchema: { parse: (v) => v },
    create: () => create() as never
  })
  return { asr, llm: new LLMProviderRegistry() }
}

async function flush(): Promise<void> {
  // Yield twice so any chained microtasks (await iterable, await send) settle.
  await Promise.resolve()
  await Promise.resolve()
}

describe('ChildDispatcher', () => {
  it('creates an instance and invokes recognize', async () => {
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => ({
        id: 'stub',
        displayName: 'Stub',
        isConfigured: () => true,
        recognize: async () => ({ text: 'hello world', segments: [] })
      })),
      (m) => responses.push(m)
    )

    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const created = responses.find((r) => r.kind === 'instance')
    expect(created?.kind).toBe('instance')
    if (created?.kind !== 'instance') throw new Error('expected instance response')

    await dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: created.instanceId,
      method: 'recognize',
      args: [{ audio: new Uint8Array(0) }, {}]
    })
    const result = responses.find((r) => r.kind === 'result' && r.reqId === '2')
    expect(result?.kind).toBe('result')
    if (result?.kind !== 'result') throw new Error('expected result response')
    expect(result.value).toEqual({ text: 'hello world', segments: [] })
  })

  it('reuses the same instance for repeat create-instance calls with same configKey', async () => {
    let createCount = 0
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => {
        createCount++
        return {
          id: 'stub',
          displayName: 'Stub',
          isConfigured: () => true,
          recognize: async () => ({ text: '', segments: [] })
        }
      }),
      (m) => responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'same',
      config: {}
    })
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '2',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'same',
      config: {}
    })
    const ids = responses
      .filter((r): r is { kind: 'instance'; reqId: string; instanceId: string } => r.kind === 'instance')
      .map((r) => r.instanceId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(createCount).toBe(1)
  })

  it('serializes ProviderError subclasses on failure', async () => {
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => ({
        id: 'broken',
        displayName: 'Broken',
        isConfigured: () => true,
        recognize: async () => {
          throw new ConfigurationError('broken', 'no key')
        }
      })),
      (m) => responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error('expected instance')
    await dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'recognize',
      args: [{ audio: new Uint8Array(0) }, {}]
    })
    const err = responses.find((r) => r.kind === 'error' && r.reqId === '2')
    expect(err?.kind).toBe('error')
    if (err?.kind !== 'error') throw new Error('expected error response')
    expect(err.error.name).toBe('ConfigurationError')
    expect(err.error.providerId).toBe('broken')
    expect(err.error.message).toBe('no key')
  })

  it('streams async iterable chunks until end', async () => {
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => ({
        id: 'streamer',
        displayName: 'Streamer',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] }),
        async *installModel() {
          yield { phase: 'downloading', downloadedBytes: 50, totalBytes: 100 }
          yield { phase: 'downloading', downloadedBytes: 100, totalBytes: 100 }
          yield { phase: 'finalizing' }
        }
      })),
      (m) => responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error('expected instance')
    await dispatcher.handle({
      kind: 'invoke-stream',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'installModel',
      args: ['model-a']
    })
    const yields = responses.filter((r) => r.kind === 'stream-yield' && r.reqId === '2')
    expect(yields).toHaveLength(3)
    expect(responses.find((r) => r.kind === 'stream-end' && r.reqId === '2')).toBeTruthy()
  })

  it('injects a real AbortSignal where the slot sentinel appears in args', async () => {
    let receivedSignal: AbortSignal | undefined
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => ({
        id: 'aware',
        displayName: 'Signal-aware',
        isConfigured: () => true,
        recognize: async (_input: unknown, options: { signal?: AbortSignal }) => {
          receivedSignal = options?.signal
          return { text: 'ok', segments: [] }
        }
      })),
      (m) => responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error('expected instance')
    await dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'recognize',
      args: [{ audio: new Uint8Array(0) }, { signal: { [SIGNAL_SLOT_MARKER]: true } }]
    })
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal?.aborted).toBe(false)
  })

  it('cancel aborts the in-flight signal', async () => {
    const responses: ChildResponse[] = []
    let observedAbort = false
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => ({
        id: 'slow',
        displayName: 'Slow',
        isConfigured: () => true,
        recognize: async (_input: unknown, options: { signal?: AbortSignal }) => {
          await new Promise<void>((_resolve, reject) => {
            const onAbort = (): void => {
              observedAbort = true
              reject(new Error('aborted'))
            }
            options.signal?.addEventListener('abort', onAbort, { once: true })
          })
          return { text: '', segments: [] }
        }
      })),
      (m) => responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error('expected instance')
    const invokePromise = dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'recognize',
      args: [{ audio: new Uint8Array(0) }, { signal: { [SIGNAL_SLOT_MARKER]: true } }]
    })
    await flush()
    await dispatcher.handle({ kind: 'cancel', reqId: '2' })
    await invokePromise
    expect(observedAbort).toBe(true)
    expect(responses.find((r) => r.kind === 'error' && r.reqId === '2')).toBeTruthy()
  })

  it('returns method-not-implemented error for unknown methods', async () => {
    const responses: ChildResponse[] = []
    const dispatcher = new ChildDispatcher(
      makeStubASRRegistries(() => ({
        id: 'minimal',
        displayName: 'Minimal',
        isConfigured: () => true,
        recognize: async () => ({ text: '', segments: [] })
      })),
      (m) => responses.push(m)
    )
    await dispatcher.handle({
      kind: 'create-instance',
      reqId: '1',
      providerKind: 'asr',
      providerId: 'stub',
      configKey: 'k',
      config: {}
    })
    const inst = responses.find((r) => r.kind === 'instance')
    if (inst?.kind !== 'instance') throw new Error('expected instance')
    await dispatcher.handle({
      kind: 'invoke',
      reqId: '2',
      instanceId: inst.instanceId,
      method: 'doesNotExist',
      args: []
    })
    const err = responses.find((r) => r.kind === 'error' && r.reqId === '2')
    expect(err?.kind).toBe('error')
    if (err?.kind !== 'error') throw new Error('expected error response')
    expect(err.error.message).toContain('doesNotExist')
  })
})
