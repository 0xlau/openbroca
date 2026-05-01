import { describe, expect, it } from 'vitest'
import { normalizeProviderSettings } from '../provider-auth'

describe('normalizeProviderSettings — selectedModelId', () => {
  it('preserves a trimmed selectedModelId for a registered local ASR provider', () => {
    const out = normalizeProviderSettings({
      providers: {
        'sherpa-onnx': {
          enabled: true,
          connectionType: 'local',
          config: { modelDir: '/tmp/m' }
        }
      },
      providerSettings: {
        'sherpa-onnx': { selectedModelId: '  paraformer-zh  ' }
      }
    })

    expect(out.providerSettings['sherpa-onnx']).toEqual({ selectedModelId: 'paraformer-zh' })
  })

  it('drops empty/whitespace selectedModelId rather than persisting it', () => {
    const out = normalizeProviderSettings({
      providers: {
        'sherpa-onnx': {
          enabled: true,
          connectionType: 'local',
          config: { modelDir: '/tmp/m' }
        }
      },
      providerSettings: {
        'sherpa-onnx': { selectedModelId: '   ' }
      }
    })

    expect(out.providerSettings['sherpa-onnx']).toBeUndefined()
  })

  it('keeps both `model` (LLM) and `selectedModelId` (local ASR) on the same providerSettings record', () => {
    const out = normalizeProviderSettings({
      providers: {
        'mock-provider': {
          enabled: true,
          connectionType: 'apiKey',
          config: { apiKey: 'k' }
        }
      },
      providerSettings: {
        'mock-provider': { model: 'gpt-4o', selectedModelId: 'paraformer-zh' }
      }
    })

    expect(out.providerSettings['mock-provider']).toEqual({
      model: 'gpt-4o',
      selectedModelId: 'paraformer-zh'
    })
  })

  it('drops settings entries for providers that are not registered', () => {
    const out = normalizeProviderSettings({
      providers: {},
      providerSettings: {
        'ghost-provider': { selectedModelId: 'something' }
      }
    })

    expect(out.providerSettings['ghost-provider']).toBeUndefined()
  })
})
