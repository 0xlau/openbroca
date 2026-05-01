import { describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import {
  ARCHITECTURES,
  STREAMING_PARAFORMER,
  STREAMING_TRANSDUCER,
  findArchitecture
} from '../architectures.ts'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn()
  }
})

const existsSyncMock = vi.mocked(fs.existsSync)
const readdirSyncMock = vi.mocked(fs.readdirSync)

describe('findArchitecture', () => {
  it('returns the registered architecture by id', () => {
    expect(findArchitecture('streaming-transducer')).toBe(STREAMING_TRANSDUCER)
    expect(findArchitecture('streaming-paraformer')).toBe(STREAMING_PARAFORMER)
  })

  it('returns undefined for an unknown id', () => {
    expect(findArchitecture('whisper')).toBeUndefined()
  })

  it('exposes both streaming architectures via ARCHITECTURES', () => {
    expect(ARCHITECTURES.map((arch) => arch.id)).toEqual([
      'streaming-transducer',
      'streaming-paraformer'
    ])
  })
})

describe('STREAMING_TRANSDUCER.describe', () => {
  it('discovers version-stamped encoder/decoder/joiner files', () => {
    existsSyncMock.mockImplementation((p) => {
      const s = String(p)
      return s === '/m' || s.endsWith('tokens.txt')
    })
    readdirSyncMock.mockReturnValue([
      'encoder-epoch-99-avg-1.onnx',
      'decoder-epoch-99-avg-1.onnx',
      'joiner-epoch-99-avg-1.onnx',
      'tokens.txt',
      'README.md'
    ] as never)

    expect(STREAMING_TRANSDUCER.describe('/m')).toEqual({
      files: {
        encoder: 'encoder-epoch-99-avg-1.onnx',
        decoder: 'decoder-epoch-99-avg-1.onnx',
        joiner: 'joiner-epoch-99-avg-1.onnx',
        tokens: 'tokens.txt'
      },
      missing: []
    })
  })

  it('prefers the unquantized variant when both .onnx and .int8.onnx exist', () => {
    existsSyncMock.mockImplementation((p) => {
      const s = String(p)
      return s === '/m' || s.endsWith('tokens.txt')
    })
    readdirSyncMock.mockReturnValue([
      'encoder-epoch-99-avg-1.onnx',
      'encoder-epoch-99-avg-1.int8.onnx',
      'decoder-epoch-99-avg-1.onnx',
      'decoder-epoch-99-avg-1.int8.onnx',
      'joiner-epoch-99-avg-1.onnx',
      'tokens.txt'
    ] as never)

    const result = STREAMING_TRANSDUCER.describe('/m')
    expect(result.files?.encoder).toBe('encoder-epoch-99-avg-1.onnx')
    expect(result.files?.decoder).toBe('decoder-epoch-99-avg-1.onnx')
  })

  it('reports missing patterns when files are incomplete', () => {
    existsSyncMock.mockImplementation((p) => String(p) === '/m')
    readdirSyncMock.mockReturnValue(['encoder-epoch-99-avg-1.onnx'] as never)

    expect(STREAMING_TRANSDUCER.describe('/m')).toEqual({
      files: null,
      missing: ['decoder-*.onnx', 'joiner-*.onnx', 'tokens.txt']
    })
  })

  it('reports a missing modelDir distinctly', () => {
    existsSyncMock.mockReturnValue(false)
    expect(STREAMING_TRANSDUCER.describe('/missing')).toEqual({
      files: null,
      missing: ['<modelDir>']
    })
  })
})

describe('STREAMING_PARAFORMER.describe', () => {
  it('prefers int8 variants when present', () => {
    existsSyncMock.mockImplementation((p) => {
      const s = String(p)
      if (s === '/m') return true
      if (s.endsWith('encoder.int8.onnx')) return true
      if (s.endsWith('decoder.int8.onnx')) return true
      if (s.endsWith('tokens.txt')) return true
      return false
    })

    expect(STREAMING_PARAFORMER.describe('/m')).toEqual({
      files: {
        encoder: 'encoder.int8.onnx',
        decoder: 'decoder.int8.onnx',
        tokens: 'tokens.txt'
      },
      missing: []
    })
  })

  it('falls back to non-quantized variants when int8 is missing', () => {
    existsSyncMock.mockImplementation((p) => {
      const s = String(p)
      if (s === '/m') return true
      if (s.endsWith('encoder.onnx')) return true
      if (s.endsWith('decoder.onnx')) return true
      if (s.endsWith('tokens.txt')) return true
      return false
    })

    expect(STREAMING_PARAFORMER.describe('/m')).toEqual({
      files: {
        encoder: 'encoder.onnx',
        decoder: 'decoder.onnx',
        tokens: 'tokens.txt'
      },
      missing: []
    })
  })
})
