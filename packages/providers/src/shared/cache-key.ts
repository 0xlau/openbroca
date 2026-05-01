/**
 * Deterministic JSON serialization for use as a cache key.
 * Sorts object keys so `{a:1,b:2}` and `{b:2,a:1}` produce the same string.
 * Returns `null` for values that can't be serialized (functions, symbols) — caller
 * should treat such configs as always-fresh (never cache-hit).
 */
export function stableCacheKey(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k]
      }
      return sorted
    }
    return v
  })
}
