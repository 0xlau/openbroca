import { describe, expect, it } from 'vitest'
import { deepgramDescriptor } from '../index.ts'

describe('deepgramDescriptor', () => {
  it('has correct metadata', () => {
    expect(deepgramDescriptor.id).toBe('deepgram')
    expect(deepgramDescriptor.displayName).toBe('Deepgram')
    expect(deepgramDescriptor.kind).toBe('cloud')
  })

  it('declares API key connection fields', () => {
    const connectionOptions = (
      deepgramDescriptor as {
        connectionOptions?: Array<{ type: string; fields?: Array<{ key: string }> }>
      }
    ).connectionOptions

    expect(connectionOptions).toEqual([
      expect.objectContaining({
        type: 'apiKey',
        fields: [expect.objectContaining({ key: 'apiKey' })]
      })
    ])
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

  it('declares streaming capabilities', () => {
    expect(deepgramDescriptor.capabilities).toEqual(
      expect.objectContaining({ streaming: true })
    )
  })

  it('declares a language settings item and is ready by default', () => {
    expect(deepgramDescriptor.settingsItems).toEqual([
      expect.objectContaining({
        key: 'language',
        type: 'select',
        label: 'Language'
      })
    ])

    const status = deepgramDescriptor.getSetupStatus?.({ settings: {} })
    expect(status).toEqual(
      expect.objectContaining({
        status: 'ready',
        canActivate: true
      })
    )
  })
})
