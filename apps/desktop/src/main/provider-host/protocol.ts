import { ConfigurationError, ProviderError, TranscriptionError } from '@openbroca/providers'

export type ProviderKind = 'asr' | 'llm'

export interface SerializedError {
  name: string
  message: string
  providerId?: string
  stack?: string
  cause?: SerializedError
}

export type ChildRequest =
  | {
      kind: 'create-instance'
      reqId: string
      providerKind: ProviderKind
      providerId: string
      configKey: string
      config: unknown
    }
  | { kind: 'invoke'; reqId: string; instanceId: string; method: string; args: unknown[] }
  | { kind: 'invoke-stream'; reqId: string; instanceId: string; method: string; args: unknown[] }
  | { kind: 'cancel'; reqId: string }
  | { kind: 'dispose-instance'; reqId: string; instanceId: string }

export type ChildInit = { kind: 'init'; defaultModelDir: string }

export type ChildResponse =
  | { kind: 'instance'; reqId: string; instanceId: string }
  | { kind: 'result'; reqId: string; value: unknown }
  | { kind: 'error'; reqId: string; error: SerializedError }
  | { kind: 'stream-yield'; reqId: string; value: unknown }
  | { kind: 'stream-end'; reqId: string }
  | { kind: 'stream-error'; reqId: string; error: SerializedError }
  | { kind: 'ready' }

// Sentinel placed in IPC args by the main-side proxy to mark where the child
// should inject a per-call AbortSignal. Plain AbortSignal instances cannot
// cross the structured-clone boundary.
export const SIGNAL_SLOT_MARKER = '__providerHostSignalSlot' as const
export interface SignalSlot {
  [SIGNAL_SLOT_MARKER]: true
}

export function isSignalSlot(value: unknown): value is SignalSlot {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[SIGNAL_SLOT_MARKER] === true
  )
}

// ProviderError's constructor wraps the message as `[${providerId}] ${msg}`.
// To avoid double-wrapping on round-trip we strip the prefix when serializing
// and let the constructor re-add it on deserialize.
function rawProviderMessage(error: ProviderError): string {
  const prefix = `[${error.providerId}] `
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof ProviderError) {
    return {
      name: error.constructor.name,
      message: rawProviderMessage(error),
      providerId: error.providerId,
      stack: error.stack,
      cause: error.cause !== undefined ? serializeError(error.cause) : undefined
    }
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: cause !== undefined ? serializeError(cause) : undefined
    }
  }
  return { name: 'Error', message: typeof error === 'string' ? error : 'Unknown error' }
}

export function deserializeError(serialized: SerializedError): Error {
  const cause = serialized.cause ? deserializeError(serialized.cause) : undefined
  const providerId = serialized.providerId ?? 'unknown'
  let error: Error
  switch (serialized.name) {
    case 'ConfigurationError':
      error = new ConfigurationError(providerId, serialized.message)
      break
    case 'TranscriptionError':
      error = new TranscriptionError(providerId, serialized.message, cause)
      break
    case 'ProviderError':
      error = new ProviderError(providerId, serialized.message, cause)
      break
    default:
      error = new Error(serialized.message)
      if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause
      break
  }
  if (serialized.stack) error.stack = serialized.stack
  return error
}

// Canonicalize a value into a stable JSON form: object keys are sorted
// alphabetically and `undefined` fields are dropped. Used to produce a
// content-addressed key for caching provider instances by config.
export function stableConfigKey(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return entries.map(([k, v]) => [k, canonicalize(v)])
  }
  return value
}
