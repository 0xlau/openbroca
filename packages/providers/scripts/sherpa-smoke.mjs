#!/usr/bin/env node
import { createRequire } from 'node:module'
import * as path from 'node:path'

const sherpa = createRequire(import.meta.url)('sherpa-onnx-node')

const MODEL_DIR =
  process.env.MODEL_DIR ??
  path.join(
    process.env.HOME,
    'Library/Application Support/desktop/asr-models/sherpa-onnx/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23'
  )
const WAV = process.argv[2]
if (!WAV) {
  console.error('usage: sherpa-smoke.mjs <wav-path>')
  process.exit(2)
}

console.log('model dir:', MODEL_DIR)
console.log('wav:', WAV)

const config = {
  decodingMethod: 'greedy_search',
  enableEndpoint: 1,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 1.2,
  rule3MinUtteranceLength: 20,
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: {
      encoder: path.join(MODEL_DIR, 'encoder-epoch-99-avg-1.onnx'),
      decoder: path.join(MODEL_DIR, 'decoder-epoch-99-avg-1.onnx'),
      joiner: path.join(MODEL_DIR, 'joiner-epoch-99-avg-1.onnx')
    },
    tokens: path.join(MODEL_DIR, 'tokens.txt'),
    numThreads: 1,
    debug: 1
  }
}

console.log('config:', JSON.stringify(config, null, 2))

const recognizer = new sherpa.OnlineRecognizer(config)
const stream = recognizer.createStream()

const wave = sherpa.readWave(WAV)
console.log('wave samples:', wave.samples.length, 'sampleRate:', wave.sampleRate)

// Reproduce the pipeline's custom resampler: float32 → int16 → linear-interp
// resample to 16kHz → int16 → float32. If sherpa returns text when fed the raw
// 48kHz samples but empty when fed our resampled 16kHz, the resampler is the
// culprit.
function pipelineResample(samples, fromRate, toRate) {
  const int16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.round(samples[i] * 32767)
    int16[i] = Math.max(-32768, Math.min(32767, v))
  }
  if (fromRate === toRate) {
    const out = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768
    return out
  }
  const outLen = Math.max(1, Math.round((int16.length * toRate) / fromRate))
  const out = new Float32Array(outLen)
  const step = fromRate / toRate
  for (let i = 0; i < outLen; i++) {
    const src = i * step
    const left = Math.floor(src)
    const right = Math.min(left + 1, int16.length - 1)
    const w = src - left
    const interpolated = int16[left] * (1 - w) + int16[right] * w
    const clipped = Math.max(-32768, Math.min(32767, Math.round(interpolated)))
    out[i] = clipped / 32768
  }
  return out
}

const mode = process.env.MODE ?? 'native'
let samples, sampleRate
if (mode === 'pipeline-resample') {
  samples = pipelineResample(wave.samples, wave.sampleRate, 16000)
  sampleRate = 16000
  console.log(`MODE=pipeline-resample → ${samples.length} samples @ 16000Hz`)
} else {
  samples = wave.samples
  sampleRate = wave.sampleRate
  console.log(`MODE=native → ${samples.length} samples @ ${sampleRate}Hz`)
}

stream.acceptWaveform({ samples, sampleRate })

const tail = new Float32Array(Math.floor(sampleRate * 0.5))
stream.acceptWaveform({ samples: tail, sampleRate })

stream.inputFinished()

let iter = 0
while (recognizer.isReady(stream)) {
  recognizer.decode(stream)
  iter += 1
  const partial = recognizer.getResult(stream)
  console.log(`  iter=${iter} text=${JSON.stringify(partial.text)} endpoint=${recognizer.isEndpoint(stream)}`)
  if (iter > 200) {
    console.log('  (capping iters)')
    break
  }
}

const result = recognizer.getResult(stream)
console.log('FINAL:', JSON.stringify(result, null, 2))
