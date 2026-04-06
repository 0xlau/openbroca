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

  it('declares a model settings item and setup status readiness', () => {
    expect(openrouterDescriptor.settingsItems).toEqual([
      expect.objectContaining({
        key: 'model',
        type: 'model-select',
        label: 'Model',
        required: true,
        dataSource: 'llm-models'
      })
    ])

    expect(openrouterDescriptor.settingsSchema).toBeDefined()
    const parsed = openrouterDescriptor.settingsSchema!.parse({ model: ' openai/gpt-4o-mini ' })
    expect(parsed.model).toBe('openai/gpt-4o-mini')

    const missing = openrouterDescriptor.getSetupStatus!({ settings: {} })
    expect(missing).toEqual(
      expect.objectContaining({
        status: 'configured',
        canActivate: false,
        fieldErrors: expect.objectContaining({ model: expect.any(String) }),
        blockingReasons: expect.arrayContaining([expect.stringMatching(/choose a model/i)])
      })
    )

    const blank = openrouterDescriptor.getSetupStatus!({ settings: { model: '' } })
    expect(blank).toEqual(
      expect.objectContaining({
        status: 'configured',
        canActivate: false,
        fieldErrors: expect.objectContaining({ model: expect.any(String) }),
        blockingReasons: expect.arrayContaining([expect.stringMatching(/choose a model/i)])
      })
    )

    const ready = openrouterDescriptor.getSetupStatus!({
      settings: { model: 'openai/gpt-4o-mini' }
    })
    expect(ready).toEqual(
      expect.objectContaining({
        status: 'ready',
        canActivate: true
      })
    )
  })
})
