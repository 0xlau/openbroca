import { describe, expect, it } from 'vitest'
import { openaiDescriptor } from '../index'

describe('openaiDescriptor', () => {
  it('has correct metadata', () => {
    expect(openaiDescriptor.id).toBe('openai')
    expect(openaiDescriptor.displayName).toBe('OpenAI')
    expect(typeof openaiDescriptor.description).toBe('string')
  })

  it('declares expected capabilities', () => {
    const caps = openaiDescriptor.capabilities ?? {}
    expect(caps.streaming).toBe(true)
    expect(caps.functionCalling).toBe(true)
    expect(caps.vision).toBe(true)
    expect(caps.jsonMode).toBe(true)
  })

  it('config schema accepts valid config', () => {
    const config = openaiDescriptor.configSchema.parse({ apiKey: 'sk-test' })
    expect(config.apiKey).toBe('sk-test')
  })

  it('config schema accepts optional fields', () => {
    const config = openaiDescriptor.configSchema.parse({
      apiKey: 'sk-test',
      baseUrl: 'http://localhost:11434/v1',
      organization: 'org-123',
    })
    expect(config.baseUrl).toBe('http://localhost:11434/v1')
    expect(config.organization).toBe('org-123')
  })

  it('config schema rejects empty apiKey', () => {
    expect(() => openaiDescriptor.configSchema.parse({ apiKey: '' })).toThrow()
  })

  it('config schema rejects missing apiKey', () => {
    expect(() => openaiDescriptor.configSchema.parse({})).toThrow()
  })

  it('create() returns a provider with correct id', () => {
    const provider = openaiDescriptor.create({ apiKey: 'sk-test' })
    expect(provider.id).toBe('openai')
    expect(provider.displayName).toBe('OpenAI')
    expect(provider.isConfigured()).toBe(true)
  })
})
