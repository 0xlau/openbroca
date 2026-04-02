import { describe, expect, it } from 'vitest'
import type { RecognitionInput, TranscriptionEvent } from '../contracts.ts'
import {
  DEFAULT_ASR_CAPABILITIES,
  recognizeFromTranscribe,
  resolveASRCapabilities,
} from '../contracts.ts'

const emptyInput: RecognitionInput = { audio: [] }

describe('ASR contracts', () => {
  describe('resolveASRCapabilities', () => {
    it('defaults to non-streaming only', () => {
      expect(resolveASRCapabilities()).toEqual(DEFAULT_ASR_CAPABILITIES)
    })

    it('merges descriptor overrides', () => {
      expect(resolveASRCapabilities({ streaming: true })).toEqual({
        nonStreaming: true,
        streaming: true,
      })
    })
  })

  describe('recognizeFromTranscribe', () => {
    it('builds final result from final events only', async () => {
      const transcribe = async function* (): AsyncIterable<TranscriptionEvent> {
        yield { type: 'interim', segment: { text: 'draft', isFinal: false } }
        yield { type: 'final', segment: { text: 'hello', isFinal: true } }
        yield { type: 'interim', segment: { text: 'temp', isFinal: false } }
        yield { type: 'final', segment: { text: 'world', isFinal: true } }
      }

      const recognize = recognizeFromTranscribe(transcribe)
      const result = await recognize(emptyInput)

      expect(result.text).toBe('hello world')
      expect(result.segments).toHaveLength(2)
      expect(result.segments.map((segment) => segment.text)).toEqual(['hello', 'world'])
    })
  })
})
