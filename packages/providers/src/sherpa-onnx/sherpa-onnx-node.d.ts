interface SherpaOnlineStream {
  acceptWaveform(data: { sampleRate: number; samples: Float32Array }): void
  free(): void
}

interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream
  isReady(stream: SherpaOnlineStream): boolean
  decode(stream: SherpaOnlineStream): void
  getResult(stream: SherpaOnlineStream): { text: string; isEndpoint: boolean }
  reset(stream: SherpaOnlineStream): void
}

declare module 'sherpa-onnx-node' {
  export const OnlineRecognizer: new (config: Record<string, unknown>) => SherpaOnlineRecognizer
}
