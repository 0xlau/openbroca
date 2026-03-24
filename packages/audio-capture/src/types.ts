export interface AudioDevice {
  /** PortAudio device index */
  id: number
  name: string
  maxInputChannels: number
  defaultSampleRate: number
  isDefault: boolean
}

export interface CaptureOptions {
  /** PortAudio device index. Omit to use system default. */
  deviceId?: number
  /** Sample rate in Hz. Default: 16000 */
  sampleRate?: number
  /** Number of channels. Default: 1 (mono) */
  channels?: number
  /** Bits per sample. Default: 16 */
  bitDepth?: number
  /** Frames per buffer. Default: 512 */
  framesPerBuffer?: number
  /** Cancellation signal. When aborted, the stream ends cleanly. */
  signal?: AbortSignal
}

export interface AudioFormat {
  sampleRate: number
  channels: number
  bitDepth: number
}

export interface AudioCaptureSource {
  /** List available input devices */
  listDevices(): AudioDevice[]
  /**
   * Resolve the actual audio format that will be used for the given options.
   * Call this before capture() to know the real sample rate (device may not support 16kHz).
   */
  resolveFormat(options?: Pick<CaptureOptions, 'deviceId' | 'sampleRate' | 'channels' | 'bitDepth'>): AudioFormat
  /** Start capturing mic audio as raw PCM chunks */
  capture(options?: CaptureOptions): AsyncIterable<Uint8Array>
}
