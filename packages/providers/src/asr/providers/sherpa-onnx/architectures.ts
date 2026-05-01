import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Resolved filenames found inside a model directory, keyed by semantic role
 * (e.g. `encoder`, `decoder`, `joiner`, `tokens`). The set of keys depends on
 * the architecture.
 */
export type SherpaArchitectureFiles = Record<string, string>

export interface SherpaArchitectureDescription {
  /** Resolved filenames, or `null` if the model directory is incomplete. */
  files: SherpaArchitectureFiles | null
  /** Human-readable list of missing patterns; empty when files are present. */
  missing: string[]
}

/**
 * Knows how to identify and load one family of sherpa-onnx models. Adding
 * support for a new model architecture is a matter of writing one of these
 * and registering it in `ARCHITECTURES`. Catalog entries reference the
 * architecture by `id`; the manifest entries themselves carry no
 * architecture-specific code.
 */
export interface SherpaArchitecture {
  id: string
  /** Inspect a model directory and report which required files are present. */
  describe(modelPath: string): SherpaArchitectureDescription
  /** Build the sherpa-onnx OnlineRecognizer config for this architecture. */
  buildRecognizerConfig(
    modelPath: string,
    files: SherpaArchitectureFiles
  ): Record<string, unknown>
}

const DEFAULT_FEAT_CONFIG = { sampleRate: 16000, featureDim: 80 }

/**
 * Flat top-level recognizer fields shared by every architecture. sherpa-onnx-node
 * expects endpoint rules as `rule1MinTrailingSilence` etc. on the recognizer
 * config root — nested `endpointConfig.rule1.minTrailingSilence` is silently
 * ignored, which manifests as empty transcripts because the recognizer never
 * commits a result.
 */
const DEFAULT_RECOGNIZER_FIELDS = {
  decodingMethod: 'greedy_search',
  enableEndpoint: 1,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 1.2,
  rule3MinUtteranceLength: 20
}

/**
 * Returns the first .onnx file in `modelPath` whose name starts with `prefix`.
 * Prefers the unquantized file when both `<prefix>...onnx` and
 * `<prefix>....int8.onnx` exist, matching the historical default config.
 */
function findOnnx(modelPath: string, prefix: string): string | undefined {
  let entries: string[]
  try {
    entries = fs.readdirSync(modelPath)
  } catch {
    return undefined
  }
  const matches = entries
    .filter((name) => name.startsWith(prefix) && name.endsWith('.onnx'))
    .sort()
  return matches.find((name) => !name.includes('.int8.')) ?? matches[0]
}

/**
 * Streaming transducer family — covers zipformer, conformer, and other
 * encoder/decoder/joiner-based architectures shipped by sherpa-onnx. Files are
 * version-stamped (e.g. `encoder-epoch-99-avg-1.onnx`), so we glob by prefix
 * rather than expecting an exact name.
 */
export const STREAMING_TRANSDUCER: SherpaArchitecture = {
  id: 'streaming-transducer',
  describe(modelPath) {
    if (!fs.existsSync(modelPath)) {
      return { files: null, missing: ['<modelDir>'] }
    }
    const encoder = findOnnx(modelPath, 'encoder')
    const decoder = findOnnx(modelPath, 'decoder')
    const joiner = findOnnx(modelPath, 'joiner')
    const tokens = fs.existsSync(path.join(modelPath, 'tokens.txt')) ? 'tokens.txt' : undefined

    const missing: string[] = []
    if (!encoder) missing.push('encoder-*.onnx')
    if (!decoder) missing.push('decoder-*.onnx')
    if (!joiner) missing.push('joiner-*.onnx')
    if (!tokens) missing.push('tokens.txt')
    if (missing.length > 0) return { files: null, missing }

    return {
      files: {
        encoder: encoder!,
        decoder: decoder!,
        joiner: joiner!,
        tokens: tokens!
      },
      missing: []
    }
  },
  buildRecognizerConfig(modelPath, files) {
    return {
      ...DEFAULT_RECOGNIZER_FIELDS,
      featConfig: DEFAULT_FEAT_CONFIG,
      modelConfig: {
        transducer: {
          encoder: path.join(modelPath, files.encoder),
          decoder: path.join(modelPath, files.decoder),
          joiner: path.join(modelPath, files.joiner)
        },
        tokens: path.join(modelPath, files.tokens),
        numThreads: 1,
        debug: 0
      }
    }
  }
}

/**
 * Streaming paraformer family. File naming is fixed (no version suffix).
 * Prefers the int8-quantized variants when present (smaller and faster on
 * most hardware, matching upstream defaults).
 */
export const STREAMING_PARAFORMER: SherpaArchitecture = {
  id: 'streaming-paraformer',
  describe(modelPath) {
    if (!fs.existsSync(modelPath)) {
      return { files: null, missing: ['<modelDir>'] }
    }
    const pickFirst = (candidates: string[]) =>
      candidates.find((name) => fs.existsSync(path.join(modelPath, name)))

    const encoder = pickFirst(['encoder.int8.onnx', 'encoder.onnx'])
    const decoder = pickFirst(['decoder.int8.onnx', 'decoder.onnx'])
    const tokens = fs.existsSync(path.join(modelPath, 'tokens.txt')) ? 'tokens.txt' : undefined

    const missing: string[] = []
    if (!encoder) missing.push('encoder.[int8.]onnx')
    if (!decoder) missing.push('decoder.[int8.]onnx')
    if (!tokens) missing.push('tokens.txt')
    if (missing.length > 0) return { files: null, missing }

    return {
      files: { encoder: encoder!, decoder: decoder!, tokens: tokens! },
      missing: []
    }
  },
  buildRecognizerConfig(modelPath, files) {
    return {
      ...DEFAULT_RECOGNIZER_FIELDS,
      featConfig: DEFAULT_FEAT_CONFIG,
      modelConfig: {
        paraformer: {
          encoder: path.join(modelPath, files.encoder),
          decoder: path.join(modelPath, files.decoder)
        },
        tokens: path.join(modelPath, files.tokens),
        numThreads: 1,
        debug: 0
      }
    }
  }
}

/**
 * Built-in architecture registry. Catalog entries reference these by `id`.
 * Adding support for whisper / sense-voice / etc. is a matter of adding a
 * new SherpaArchitecture here — manifest entries do not need to change shape.
 */
export const ARCHITECTURES: ReadonlyArray<SherpaArchitecture> = [
  STREAMING_TRANSDUCER,
  STREAMING_PARAFORMER
]

export function findArchitecture(id: string): SherpaArchitecture | undefined {
  return ARCHITECTURES.find((arch) => arch.id === id)
}
