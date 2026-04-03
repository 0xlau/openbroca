import { describe, expect, it } from 'vitest'
import { ConfigurationError } from '../../../../shared/errors.ts'
import { OpenRouterLLMProvider } from '../provider.ts'
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

describe('OpenRouterLLMProvider stub', () => {
  const provider = new OpenRouterLLMProvider({
    apiKey: 'or-key'
  })

  const request = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'test' }]
  }

  it('throws ConfigurationError for listModels/generate/complete', async () => {
    await expect(provider.listModels()).rejects.toBeInstanceOf(ConfigurationError)
    await expect(provider.generate(request)).rejects.toBeInstanceOf(ConfigurationError)
    const completeIterator = provider.complete(request)
    await expect(completeIterator.next()).rejects.toBeInstanceOf(ConfigurationError)
  })

  it('remains configured with a trimmed apiKey', () => {
    expect(provider.isConfigured()).toBe(true)
  })
})
