import { describe, expect, it } from 'vitest'
import { ConfigurationError, ProviderError, TranscriptionError } from '@openbroca/providers'
import { deserializeError, serializeError, stableConfigKey } from '../protocol'

describe('protocol', () => {
  describe('serializeError / deserializeError', () => {
    it('round-trips ProviderError preserving providerId, message, and class', () => {
      const cause = new Error('underlying')
      const original = new ProviderError('sherpa-onnx', 'native crash', cause)
      const restored = deserializeError(serializeError(original))
      expect(restored).toBeInstanceOf(ProviderError)
      // Message survives full round-trip without double-wrapping the [providerId] prefix.
      expect(restored.message).toBe(original.message)
      expect((restored as ProviderError).providerId).toBe('sherpa-onnx')
    })

    it('round-trips ConfigurationError as the right subclass', () => {
      const original = new ConfigurationError('openai', 'missing key')
      const restored = deserializeError(serializeError(original))
      expect(restored).toBeInstanceOf(ConfigurationError)
      expect(restored).toBeInstanceOf(ProviderError)
      expect(restored.message).toBe(original.message)
    })

    it('round-trips TranscriptionError as the right subclass', () => {
      const original = new TranscriptionError('deepgram', 'bad audio')
      const restored = deserializeError(serializeError(original))
      expect(restored).toBeInstanceOf(TranscriptionError)
      expect(restored.message).toBe(original.message)
    })

    it('falls back to plain Error for unknown classes', () => {
      const restored = deserializeError(serializeError(new RangeError('out of range')))
      expect(restored).toBeInstanceOf(Error)
      expect(restored.message).toBe('out of range')
    })

    it('preserves nested cause chain', () => {
      const root = new Error('root')
      const wrapped = new TranscriptionError('deepgram', 'wrapped', root)
      const restored = deserializeError(serializeError(wrapped))
      expect(restored).toBeInstanceOf(TranscriptionError)
      const cause = (restored as TranscriptionError).cause
      expect(cause).toBeInstanceOf(Error)
      expect((cause as Error).message).toBe('root')
    })
  })

  describe('stableConfigKey', () => {
    it('produces equal keys for objects with reordered keys', () => {
      expect(stableConfigKey({ a: 1, b: 2 })).toBe(stableConfigKey({ b: 2, a: 1 }))
    })

    it('differs for different values', () => {
      expect(stableConfigKey({ apiKey: 'x' })).not.toBe(stableConfigKey({ apiKey: 'y' }))
    })

    it('handles nested objects and arrays', () => {
      const a = stableConfigKey({ models: [{ id: 'a' }, { id: 'b' }], opts: { x: 1 } })
      const b = stableConfigKey({ opts: { x: 1 }, models: [{ id: 'a' }, { id: 'b' }] })
      expect(a).toBe(b)
    })

    it('treats undefined fields as absent', () => {
      expect(stableConfigKey({ a: 1, b: undefined })).toBe(stableConfigKey({ a: 1 }))
    })
  })
})
