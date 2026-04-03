import { describe, expect, it } from 'vitest'
import { openrouterDescriptor } from '../index.ts'

describe('openrouterDescriptor', () => {
  it('has the correct metadata', () => {
    expect(openrouterDescriptor.id).toBe('openrouter')
    expect(openrouterDescriptor.displayName).toBe('OpenRouter')
  })

  it('exposes the requested capabilities', () => {
    expect(openrouterDescriptor.capabilities).toEqual({
      streaming: true,
      nonStreaming: true,
      functionCalling: true,
      vision: true,
      jsonMode: true
    })
  })

  it('declares an API key connection option', () => {
    const connectionOptions = openrouterDescriptor.connectionOptions

    expect(connectionOptions).toEqual([
      expect.objectContaining({
        type: 'apiKey',
        fields: [expect.objectContaining({ key: 'apiKey' })]
      })
    ])
  })

  it('config schema accepts required fields', () => {
    const config = openrouterDescriptor.configSchema.parse({ apiKey: 'or-key' })
    expect(config.apiKey).toBe('or-key')
  })

  it('rejects whitespace-only apiKey', () => {
    expect(() => openrouterDescriptor.configSchema.parse({ apiKey: '   ' })).toThrow()
  })

  it('rejects empty apiKey', () => {
    expect(() => openrouterDescriptor.configSchema.parse({ apiKey: '' })).toThrow()
  })

  it('create() returns a configured provider', () => {
    const provider = openrouterDescriptor.create({ apiKey: 'or-key' })
    expect(provider.id).toBe('openrouter')
    expect(provider.displayName).toBe('OpenRouter')
    expect(provider.isConfigured()).toBe(true)
  })
})
