import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { app } from 'electron'
import { RecordingStorage } from '../recording-storage'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/Users/example/Library/Application Support/OpenBroca')
  }
}))

describe('RecordingStorage', () => {
  test('writes WAV files under userData/recordings', async () => {
    const mkdir = vi.fn()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const storage = new RecordingStorage({
      mkdir,
      writeFile,
      now: () => new Date('2026-04-02T10:00:00.000Z')
    })

    const stored = await storage.save({
      format: { sampleRate: 16000, channels: 1, bitDepth: 16 },
      chunks: [new Uint8Array([1, 2, 3, 4])],
      startedAt: '2026-04-02T10:00:00.000Z',
      endedAt: '2026-04-02T10:00:01.200Z',
      durationMs: 1200
    })

    const basePath = '/Users/example/Library/Application Support/OpenBroca'
    const expectedFileName = 'openbroca-2026-04-02T10-00-00-000Z.wav'
    const expectedPath = join(basePath, 'recordings', expectedFileName)

    expect(app.getPath).toHaveBeenCalledWith('userData')
    expect(mkdir).toHaveBeenCalledWith(join(basePath, 'recordings'), { recursive: true })
    expect(writeFile).toHaveBeenCalledWith(expectedPath, expect.any(Buffer))
    expect(stored.audioFilePath).toBe(expectedPath)
    expect(stored.fileName).toBe(expectedFileName)

    const writtenBuffer = writeFile.mock.calls[0]?.[1] as Buffer
    expect(writtenBuffer?.slice(0, 4).toString()).toBe('RIFF')
    expect(writtenBuffer?.slice(8, 12).toString()).toBe('WAVE')
    expect(stored.byteLength).toBe(writtenBuffer.byteLength)
  })
})
