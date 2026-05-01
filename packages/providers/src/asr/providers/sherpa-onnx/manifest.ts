/**
 * Static catalog of sherpa-onnx models OpenBroca knows how to install.
 *
 * Adding a new model is a JSON edit — append an entry, set its `architecture`
 * to one of the registered ids in `architectures.ts`. No code changes required
 * unless the model uses a brand-new architecture.
 *
 * `sizeBytes` is the on-the-wire archive size (Content-Length from the
 * GitHub release CDN, fetched via HEAD or the GitHub releases API). When an
 * entry has no `sha256`, install verifies that the downloaded byte count
 * matches `sizeBytes` instead of computing a hash; this catches truncation
 * and mid-flight errors but doesn't protect against a malicious upstream.
 * Strict-integrity callers can fill `sha256` via `pnpm sherpa:hash <id>`.
 */
export interface SherpaModelManifestEntry {
  id: string
  name: string
  description?: string
  sizeBytes: number
  downloadUrl: string
  /** Optional sha256. When present, archives that don't match are rejected. */
  sha256?: string
  /** Sub-directory the archive extracts into. */
  subDir: string
  /** Must match a registered SherpaArchitecture.id. */
  architecture: string
  /** ISO language tags this model is intended for; UI uses these for the recommended highlight. */
  recommendedFor?: string[]
}

const RELEASE_BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models'

export const DEFAULT_SHERPA_MODELS: SherpaModelManifestEntry[] = [
  // ---- English (Zipformer / streaming-transducer) ----
  {
    id: 'zipformer-en-small',
    name: 'Zipformer English (Mobile)',
    description: 'Streaming Zipformer English mobile model — small, low-latency.',
    sizeBytes: 305_410_008,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-zipformer-en-2023-06-26-mobile',
    architecture: 'streaming-transducer',
    recommendedFor: ['en']
  },
  {
    id: 'zipformer-en-large',
    name: 'Zipformer English (Full)',
    description: 'Streaming Zipformer English full-quality model.',
    sizeBytes: 506_956_414,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-en-2023-06-21.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-zipformer-en-2023-06-21',
    architecture: 'streaming-transducer',
    recommendedFor: ['en']
  },

  // ---- Chinese / Bilingual / Multi (Zipformer transducer) ----
  {
    id: 'zipformer-zh-small',
    name: 'Zipformer Chinese (14M)',
    description: 'Streaming Zipformer Chinese tiny model — 14M params.',
    sizeBytes: 74_004_050,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23.tar.bz2`,
    sha256: '2cbd71b640d9c37d3784f29367333a4577b0398b62e9deeed418170b081cba8b',
    subDir: 'sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23',
    architecture: 'streaming-transducer',
    recommendedFor: ['zh', 'zh-CN']
  },
  {
    id: 'zipformer-bilingual-zh-en',
    name: 'Zipformer Chinese-English Bilingual',
    description: 'Streaming Zipformer bilingual Chinese-English.',
    sizeBytes: 511_274_346,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
    architecture: 'streaming-transducer',
    recommendedFor: ['zh', 'zh-CN', 'en']
  },
  {
    id: 'zipformer-multi-zh-hans',
    name: 'Zipformer Multi Chinese (Simplified)',
    description: 'Streaming Zipformer trained on multiple Chinese (Simplified) datasets.',
    sizeBytes: 310_380_628,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-multi-zh-hans-2023-12-12.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-zipformer-multi-zh-hans-2023-12-12',
    architecture: 'streaming-transducer',
    recommendedFor: ['zh', 'zh-CN']
  },

  // ---- Other languages (Zipformer transducer) ----
  {
    id: 'zipformer-fr',
    name: 'Zipformer French',
    description: 'Streaming Zipformer French.',
    sizeBytes: 398_444_115,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-fr-2023-04-14.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-zipformer-fr-2023-04-14',
    architecture: 'streaming-transducer',
    recommendedFor: ['fr']
  },
  {
    id: 'zipformer-ko',
    name: 'Zipformer Korean',
    description: 'Streaming Zipformer Korean.',
    sizeBytes: 418_218_652,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-zipformer-korean-2024-06-16.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-zipformer-korean-2024-06-16',
    architecture: 'streaming-transducer',
    recommendedFor: ['ko']
  },

  // ---- Paraformer family (streaming-paraformer) ----
  {
    id: 'paraformer-zh',
    name: 'Paraformer Chinese-English',
    description: 'Streaming Paraformer bilingual Chinese-English.',
    sizeBytes: 1_047_319_737,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
    architecture: 'streaming-paraformer',
    recommendedFor: ['zh', 'zh-CN', 'en']
  },
  {
    id: 'paraformer-zh-cantonese-en',
    name: 'Paraformer Chinese-Cantonese-English',
    description: 'Streaming Paraformer trilingual Chinese-Cantonese-English.',
    sizeBytes: 1_047_671_211,
    downloadUrl: `${RELEASE_BASE}/sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en.tar.bz2`,
    subDir: 'sherpa-onnx-streaming-paraformer-trilingual-zh-cantonese-en',
    architecture: 'streaming-paraformer',
    recommendedFor: ['zh', 'zh-CN', 'zh-HK', 'en']
  }
]
