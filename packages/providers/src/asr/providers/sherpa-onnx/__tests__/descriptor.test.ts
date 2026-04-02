import { describe, expect, it } from 'vitest'
import { sherpaOnnxDescriptor } from '../index.ts'

describe('sherpaOnnxDescriptor', () => {
  it('has correct metadata', () => {
    expect(sherpaOnnxDescriptor.id).toBe('sherpa-onnx')
    expect(sherpaOnnxDescriptor.displayName).toBe('@k2-fsa/sherpa-onnx')
    expect(sherpaOnnxDescriptor.kind).toBe('local')
    expect(sherpaOnnxDescriptor.capabilities).toEqual(
      expect.objectContaining({ streaming: true })
    )
  })

  it('declares local connection fields', () => {
    const connectionOptions = (
      sherpaOnnxDescriptor as {
        connectionOptions?: Array<{ type: string; fields?: Array<{ key: string }> }>
      }
    ).connectionOptions

    expect(connectionOptions).toEqual([
      expect.objectContaining({
        type: 'local',
        fields: [expect.objectContaining({ key: 'modelDir' })]
      })
    ])
  })

  it('config schema accepts valid config', () => {
    const config = sherpaOnnxDescriptor.configSchema.parse({ modelDir: '/tmp/models' })
    expect(config.modelDir).toBe('/tmp/models')
  })

  it('config schema rejects empty modelDir', () => {
    expect(() => sherpaOnnxDescriptor.configSchema.parse({ modelDir: '' })).toThrow()
  })

  it('config schema rejects missing modelDir', () => {
    expect(() => sherpaOnnxDescriptor.configSchema.parse({})).toThrow()
  })

  it('create() returns a local provider with model management methods', () => {
    const provider = sherpaOnnxDescriptor.create({ modelDir: '/tmp/models' })
    expect(provider.id).toBe('sherpa-onnx')
    expect('listModels' in provider).toBe(true)
    expect('downloadModel' in provider).toBe(true)
    expect('deleteModel' in provider).toBe(true)
  })
})
