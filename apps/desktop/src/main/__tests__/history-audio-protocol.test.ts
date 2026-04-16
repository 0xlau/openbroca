import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  createHistoryAudioProtocolHandler,
  HISTORY_AUDIO_PROTOCOL,
  toHistoryAudioUrl
} from '../history-audio-protocol'

describe('historyAudioProtocol', () => {
  test('builds renderer-safe URLs for history audio', () => {
    expect(toHistoryAudioUrl('record-1')).toBe(`${HISTORY_AUDIO_PROTOCOL}://history/record-1`)
  })

  test('serves WAV bytes for existing history recordings', async () => {
    const handler = createHistoryAudioProtocolHandler(
      {
        getById: (id: string) =>
          id === 'record-1' ? { audioFilePath: '/tmp/one.wav' } : undefined
      },
      {
        readFile: async () => Buffer.from([82, 73, 70, 70])
      }
    )

    const response = await handler(new Request(toHistoryAudioUrl('record-1')))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/wav')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]))
  })

  test('returns not found when the history recording has no stored audio', async () => {
    const handler = createHistoryAudioProtocolHandler({
      getById: () => ({ audioFilePath: undefined })
    })

    const response = await handler(new Request(toHistoryAudioUrl('record-1')))

    expect(response.status).toBe(404)
  })

  test('registers the custom audio scheme with stream support for media elements', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf-8')

    expect(source).toContain('stream: true')
  })
})
