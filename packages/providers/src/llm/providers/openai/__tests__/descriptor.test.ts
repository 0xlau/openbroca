import { describe, expect, it } from 'vitest'
import { openaiDescriptor } from '../index.ts'
import { openaiCodexDescriptor } from '../../openai-codex/index.ts'

describe('openaiDescriptor', () => {
  it('has correct metadata', () => {
    expect(openaiDescriptor.id).toBe('openai')
    expect(openaiDescriptor.displayName).toBe('OpenAI')
    expect(typeof openaiDescriptor.description).toBe('string')
  })

  it('declares expected capabilities', () => {
    const caps = openaiDescriptor.capabilities ?? {}
    expect(caps.streaming).toBe(true)
    expect(caps.nonStreaming).toBe(true)
    expect(caps.functionCalling).toBe(true)
    expect(caps.vision).toBe(true)
    expect(caps.jsonMode).toBe(true)
  })

  it('declares API key connection fields', () => {
    const connectionOptions = (
      openaiDescriptor as {
        connectionOptions?: Array<{ type: string; fields?: Array<{ key: string }> }>
      }
    ).connectionOptions

    expect(connectionOptions).toEqual([
      expect.objectContaining({
        type: 'apiKey',
        fields: [
          expect.objectContaining({ key: 'apiKey' }),
          expect.objectContaining({ key: 'baseUrl' }),
          expect.objectContaining({ key: 'organization' })
        ]
      })
    ])
  })

  it('config schema accepts valid config', () => {
    const config = openaiDescriptor.configSchema.parse({ apiKey: 'sk-test' })
    expect(config.apiKey).toBe('sk-test')
  })

  it('config schema accepts optional fields', () => {
    const config = openaiDescriptor.configSchema.parse({
      apiKey: 'sk-test',
      baseUrl: 'http://localhost:11434/v1',
      organization: 'org-123'
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

  it('declares a model settings item and setup status readiness', () => {
    expect(openaiDescriptor.settingsItems).toEqual([
      expect.objectContaining({
        key: 'model',
        type: 'model-select',
        label: 'Model',
        required: true,
        dataSource: 'llm-models'
      })
    ])

    expect(openaiDescriptor.settingsSchema).toBeDefined()
    const parsed = openaiDescriptor.settingsSchema!.parse({ model: ' gpt-4o-mini ' })
    expect(parsed.model).toBe('gpt-4o-mini')

    const missing = openaiDescriptor.getSetupStatus!({ settings: {} })
    expect(missing).toEqual(
      expect.objectContaining({
        status: 'configured',
        canActivate: false,
        fieldErrors: expect.objectContaining({ model: expect.any(String) }),
        blockingReasons: expect.arrayContaining([expect.stringMatching(/choose a model/i)])
      })
    )

    const blank = openaiDescriptor.getSetupStatus!({ settings: { model: '   ' } })
    expect(blank).toEqual(
      expect.objectContaining({
        status: 'configured',
        canActivate: false,
        fieldErrors: expect.objectContaining({ model: expect.any(String) }),
        blockingReasons: expect.arrayContaining([expect.stringMatching(/choose a model/i)])
      })
    )

    const ready = openaiDescriptor.getSetupStatus!({ settings: { model: 'gpt-4o-mini' } })
    expect(ready).toEqual(
      expect.objectContaining({
        status: 'ready',
        canActivate: true
      })
    )
  })
})

describe('openaiCodexDescriptor', () => {
  it('declares a browser OAuth connection option for the Codex provider', () => {
    expect(openaiCodexDescriptor.connectionOptions).toEqual([
      expect.objectContaining({
        type: 'oauth',
        flow: 'systemBrowser'
      })
    ])
  })
})
