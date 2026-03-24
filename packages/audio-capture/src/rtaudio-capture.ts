import { RtAudio } from 'audify'
import type { AudioCaptureSource, AudioDevice, AudioFormat, CaptureOptions } from './types.js'

// Use numeric literals — const enum values from audify are not safe to import with esbuild
// RTAUDIO_SINT16 = 0x2, RTAUDIO_SINT32 = 0x8
const RTAUDIO_SINT16 = 0x2 as number
const RTAUDIO_SINT32 = 0x8 as number

function pickSampleRate(audio: RtAudio, deviceId: number | undefined, requested: number | undefined): number {
  const id = deviceId ?? audio.getDefaultInputDevice()
  const info = audio.getDevices().find((d) => d.id === id)
  const native = info?.preferredSampleRate ?? 44100
  const want = requested ?? native
  return (info?.sampleRates ?? []).includes(want) ? want : native
}

export class RtAudioCaptureSource implements AudioCaptureSource {
  listDevices(): AudioDevice[] {
    const audio = new RtAudio()
    const defaultInputId = audio.getDefaultInputDevice()
    return audio
      .getDevices()
      .filter((d) => d.inputChannels > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        maxInputChannels: d.inputChannels,
        defaultSampleRate: d.preferredSampleRate,
        isDefault: d.id === defaultInputId
      }))
  }

  resolveFormat(
    options?: Pick<CaptureOptions, 'deviceId' | 'sampleRate' | 'channels' | 'bitDepth'>
  ): AudioFormat {
    const audio = new RtAudio()
    return {
      sampleRate: pickSampleRate(audio, options?.deviceId, options?.sampleRate),
      channels: options?.channels ?? 1,
      bitDepth: options?.bitDepth ?? 16
    }
  }

  capture(options?: CaptureOptions): AsyncIterable<Uint8Array> {
    const { deviceId, sampleRate, channels = 1, bitDepth = 16, framesPerBuffer = 512, signal } =
      options ?? {}

    return this.createCaptureIterable({ deviceId, sampleRate, channels, bitDepth, framesPerBuffer, signal })
  }

  private async *createCaptureIterable(
    opts: Omit<CaptureOptions, 'signal'> &
      Required<Pick<CaptureOptions, 'channels' | 'bitDepth' | 'framesPerBuffer'>> & {
        signal?: AbortSignal
      }
  ): AsyncGenerator<Uint8Array> {
    if (opts.signal?.aborted) return

    const audio = new RtAudio()
    const sampleRate = pickSampleRate(audio, opts.deviceId, opts.sampleRate)

    const queue: Buffer[] = []
    let notify: (() => void) | null = null
    let done = false

    const rtFormat = opts.bitDepth === 16 ? RTAUDIO_SINT16 : RTAUDIO_SINT32

    audio.openStream(
      null,
      { deviceId: opts.deviceId, nChannels: opts.channels },
      rtFormat,
      sampleRate,
      opts.framesPerBuffer,
      'openbroca-capture',
      (inputData: Buffer) => {
        queue.push(Buffer.from(inputData))
        notify?.()
        notify = null
      },
      null
    )

    audio.start()

    const onAbort = () => {
      done = true
      notify?.()
      notify = null
    }

    opts.signal?.addEventListener('abort', onAbort, { once: true })

    try {
      while (!done) {
        if (queue.length > 0) {
          const buf = queue.shift()!
          yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        } else {
          await new Promise<void>((resolve) => {
            notify = resolve
          })
        }
      }
      // Drain remaining buffered chunks
      while (queue.length > 0) {
        const buf = queue.shift()!
        yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      }
    } finally {
      opts.signal?.removeEventListener('abort', onAbort)
      if (audio.isStreamOpen()) {
        audio.stop()
        audio.closeStream()
      }
    }
  }
}
