import { describe, expect, it } from 'vitest'
import { ConfigurationError, ProviderError, TranscriptionError } from '../errors'

describe('ProviderError', () => {
  it('formats message with provider id prefix', () => {
    const err = new ProviderError('openai', 'something went wrong')
    expect(err.message).toBe('[openai] something went wrong')
    expect(err.providerId).toBe('openai')
    expect(err.name).toBe('ProviderError')
    expect(err).toBeInstanceOf(Error)
  })

  it('stores cause', () => {
    const cause = new Error('root cause')
    const err = new ProviderError('openai', 'wrapped', cause)
    expect(err.cause).toBe(cause)
  })
})

describe('ConfigurationError', () => {
  it('is a ProviderError', () => {
    const err = new ConfigurationError('deepgram', 'missing api key')
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ConfigurationError')
    expect(err.message).toBe('[deepgram] missing api key')
  })
})

describe('TranscriptionError', () => {
  it('is a ProviderError', () => {
    const err = new TranscriptionError('sherpa-onnx', 'model not found')
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.name).toBe('TranscriptionError')
  })

  it('stores cause', () => {
    const cause = new Error('native crash')
    const err = new TranscriptionError('sherpa-onnx', 'native crash', cause)
    expect(err.cause).toBe(cause)
  })
})
