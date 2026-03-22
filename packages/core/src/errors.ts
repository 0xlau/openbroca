export class ProviderError extends Error {
  readonly providerId: string
  override readonly cause?: unknown

  constructor(
    providerId: string,
    message: string,
    cause?: unknown
  ) {
    super(`[${providerId}] ${message}`)
    this.providerId = providerId
    this.cause = cause
    this.name = 'ProviderError'
  }
}

export class ConfigurationError extends ProviderError {
  constructor(providerId: string, message: string) {
    super(providerId, message)
    this.name = 'ConfigurationError'
  }
}

export class TranscriptionError extends ProviderError {
  constructor(providerId: string, message: string, cause?: unknown) {
    super(providerId, message, cause)
    this.name = 'TranscriptionError'
  }
}
