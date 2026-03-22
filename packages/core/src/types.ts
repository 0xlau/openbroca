export interface Disposable {
  dispose(): Promise<void>
}

export interface HealthCheckable {
  validateConnection(): Promise<{ ok: boolean; error?: string }>
}

/**
 * Minimal schema interface for config validation.
 * Any Zod, Valibot, or ArkType schema satisfies this — no hard zod dependency required.
 */
export interface ConfigSchema<T> {
  parse(data: unknown): T
}
