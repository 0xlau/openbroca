// Shared OAuth contracts. Concrete authorizer implementations (one per
// provider) live alongside this file. Today the registry is empty — there are
// no OAuth-based providers — but OAuthService and the rest of the auth
// pipeline still depend on these types.

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  expiresAt?: string
  scope?: string
  idToken?: string
}

export interface OAuthAccount {
  email?: string
  accountId?: string
}

export interface OAuthSession {
  tokens: OAuthTokens
  account?: OAuthAccount
}

export interface OAuthAuthorizer {
  authorize(): Promise<OAuthSession>
  dispose?(): void | Promise<void>
}
