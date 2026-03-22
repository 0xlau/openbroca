export class ProviderError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[${providerId}] ${message}`)
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
