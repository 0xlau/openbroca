import { describe, expect, it } from 'vitest'
import { openaiCompatibleDescriptor } from '../index.ts'
import { geminiDescriptor } from '../../gemini/index.ts'
import { ollamaDescriptor } from '../../ollama/index.ts'

describe('openai-compatible descriptors', () => {
  it('creates a generic provider with baseUrl, apiKey, and model list strategy fields', () => {
    expect(openaiCompatibleDescriptor.id).toBe('openai-compatible')
    expect(openaiCompatibleDescriptor.displayName).toBe('Custom Endpoint')

    expect(openaiCompatibleDescriptor.connectionOptions).toEqual([
      expect.objectContaining({
        type: 'apiKey',
        fields: [
          expect.objectContaining({ key: 'apiKey', required: false }),
          expect.objectContaining({ key: 'baseUrl', advanced: true }),
          expect.objectContaining({ key: 'modelListStrategy', advanced: true })
        ]
      })
    ])

    const config = openaiCompatibleDescriptor.configSchema.parse({
      baseUrl: 'http://localhost:8080/v1',
      modelListStrategy: 'none'
    })
    expect(config).toEqual({
      apiKey: '',
      baseUrl: 'http://localhost:8080/v1',
      modelListStrategy: 'none'
    })
  })

  it('uses branded defaults while sharing the OpenAI-compatible provider implementation', async () => {
    const geminiConfig = geminiDescriptor.configSchema.parse({ apiKey: 'google-key' })
    expect(geminiConfig).toEqual({
      apiKey: 'google-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      modelListStrategy: 'static'
    })

    const provider = geminiDescriptor.create(geminiConfig)
    expect(provider.id).toBe('gemini')
    expect(provider.displayName).toBe('Google Gemini')
    await expect(provider.listModels()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gemini-2.5-flash' })
      ])
    )
  })

  it('allows local OpenAI-compatible providers without an API key', () => {
    const config = ollamaDescriptor.configSchema.parse({})
    const provider = ollamaDescriptor.create(config)

    expect(config).toEqual({
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      modelListStrategy: 'api'
    })
    expect(provider.isConfigured()).toBe(true)
  })

  it('requires model settings before activation', () => {
    expect(geminiDescriptor.settingsSchema?.parse({ model: ' gemini-2.5-flash ' })).toEqual({
      model: 'gemini-2.5-flash'
    })

    expect(geminiDescriptor.getSetupStatus?.({ settings: {} })).toEqual(
      expect.objectContaining({
        status: 'configured',
        canActivate: false,
        fieldErrors: expect.objectContaining({ model: expect.any(String) })
      })
    )

    expect(geminiDescriptor.getSetupStatus?.({ settings: { model: 'gemini-2.5-flash' } })).toEqual(
      expect.objectContaining({
        status: 'ready',
        canActivate: true
      })
    )
  })
})
