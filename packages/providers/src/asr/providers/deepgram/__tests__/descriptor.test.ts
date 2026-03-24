import { describe, expect, it } from 'vitest'
import { deepgramDescriptor } from '../index.ts'

describe('deepgramDescriptor', () => {
  it('has correct metadata', () => {
    expect(deepgramDescriptor.id).toBe('deepgram')
    expect(deepgramDescriptor.displayName).toBe('Deepgram')
    expect(deepgramDescriptor.kind).toBe('cloud')
  })

  it('config schema accepts valid config', () => {
    const config = deepgramDescriptor.configSchema.parse({ apiKey: 'dg-test' })
    expect(config.apiKey).toBe('dg-test')
  })

  it('config schema rejects empty apiKey', () => {
    expect(() => deepgramDescriptor.configSchema.parse({ apiKey: '' })).toThrow()
  })

  it('config schema rejects missing apiKey', () => {
    expect(() => deepgramDescriptor.configSchema.parse({})).toThrow()
  })

  it('create() returns a cloud provider with correct id', () => {
    const provider = deepgramDescriptor.create({ apiKey: 'dg-test' })
    expect(provider.id).toBe('deepgram')
    expect(provider.isConfigured()).toBe(true)
    expect('listModels' in provider).toBe(false)
  })
})
