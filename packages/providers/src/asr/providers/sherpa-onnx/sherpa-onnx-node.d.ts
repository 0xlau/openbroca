interface SherpaOnlineStream {
  acceptWaveform(data: { sampleRate: number; samples: Float32Array }): void
  inputFinished(): void
}

interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream
  isReady(stream: SherpaOnlineStream): boolean
  decode(stream: SherpaOnlineStream): void
  isEndpoint(stream: SherpaOnlineStream): boolean
  getResult(stream: SherpaOnlineStream): SherpaOnlineResult
  reset(stream: SherpaOnlineStream): void
}

interface SherpaOnlineResult {
  text: string
  tokens?: string[]
  timestamps?: number[]
  start_time?: number
  is_final?: boolean
  is_eof?: boolean
}

declare module 'sherpa-onnx-node' {
  export const OnlineRecognizer: new (config: Record<string, unknown>) => SherpaOnlineRecognizer
}
