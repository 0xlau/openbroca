import { describe, expect, it } from 'vitest'
import { createSherpaOnnxDescriptor } from '../index.ts'

const DEFAULT_DIR = '/data/asr-models/sherpa-onnx'

function makeDescriptor() {
  return createSherpaOnnxDescriptor({ defaultModelDir: DEFAULT_DIR })
}

describe('createSherpaOnnxDescriptor', () => {
  it('has correct metadata', () => {
    const descriptor = makeDescriptor()
    expect(descriptor.id).toBe('sherpa-onnx')
    expect(descriptor.displayName).toBe('@k2-fsa/sherpa-onnx')
    expect(descriptor.kind).toBe('local')
    expect(descriptor.capabilities).toEqual(expect.objectContaining({ streaming: true }))
  })

  it('declares local connection fields with the default modelDir as placeholder', () => {
    const descriptor = makeDescriptor()
    const connectionOptions = descriptor.connectionOptions ?? []
    expect(connectionOptions).toEqual([
      expect.objectContaining({
        type: 'local',
        fields: [
          expect.objectContaining({
            key: 'modelDir',
            placeholder: DEFAULT_DIR
          })
        ]
      })
    ])
  })

  it('config schema applies the default modelDir when missing', () => {
    const descriptor = makeDescriptor()
    const config = descriptor.configSchema.parse({}) as { modelDir: string }
    expect(config.modelDir).toBe(DEFAULT_DIR)
  })

  it('config schema preserves an explicit modelDir override', () => {
    const descriptor = makeDescriptor()
    const config = descriptor.configSchema.parse({ modelDir: '/elsewhere' }) as { modelDir: string }
    expect(config.modelDir).toBe('/elsewhere')
  })

  it('exposes a local-model-select settings item for selectedModelId', () => {
    const descriptor = makeDescriptor()
    expect(descriptor.settingsItems?.[0]).toMatchObject({
      key: 'selectedModelId',
      type: 'local-model-select'
    })
  })

  it('getSetupStatus returns configured when no model is selected', () => {
    const descriptor = makeDescriptor()
    const status = descriptor.getSetupStatus?.({ connection: undefined, settings: {} })
    expect(status).toMatchObject({
      status: 'configured',
      canActivate: false
    })
  })

  it('getSetupStatus returns ready when a selectedModelId is present', () => {
    const descriptor = makeDescriptor()
    const status = descriptor.getSetupStatus?.({
      connection: undefined,
      settings: { selectedModelId: 'paraformer-zh' }
    })
    expect(status).toMatchObject({ status: 'ready', canActivate: true })
  })

  it('create() returns a local provider with the new lifecycle methods', () => {
    const descriptor = makeDescriptor()
    const provider = descriptor.create({ modelDir: '/tmp/models' })
    expect(provider.id).toBe('sherpa-onnx')
    expect('listCatalogModels' in provider).toBe(true)
    expect('scanInstalledModels' in provider).toBe(true)
    expect('installModel' in provider).toBe(true)
    expect('removeInstalledModel' in provider).toBe(true)
    expect('resolveModelRuntime' in provider).toBe(true)
  })
})
