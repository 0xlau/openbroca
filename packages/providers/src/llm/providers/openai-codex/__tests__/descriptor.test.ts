import { describe, expect, it } from 'vitest'
import { openaiCodexDescriptor } from '../index.ts'
import { ConfigurationError } from '../../../../shared/errors.ts'

describe('openaiCodexDescriptor', () => {
  it('registers a distinct openai-codex provider with oauth metadata', () => {
    expect(openaiCodexDescriptor.id).toBe('openai-codex')
    expect(openaiCodexDescriptor.connectionOptions?.[0]).toEqual(
      expect.objectContaining({ type: 'oauth', flow: 'systemBrowser' })
    )
  })

  it('creates a provider that remains unconfigured until oauth is wired', () => {
    const provider = openaiCodexDescriptor.create({})

    expect(provider.isConfigured()).toBe(false)
  })

  it('config schema preserves optional runtime oauth fields', () => {
    const config = openaiCodexDescriptor.configSchema.parse({
      accessToken: 'token',
      accountId: 'acct_123',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      originator: 'codex_cli_rs'
    })

    expect(config).toEqual({
      accessToken: 'token',
      accountId: 'acct_123',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      originator: 'codex_cli_rs'
    })
  })

  it('fails fast when runtime methods are used before oauth is configured', async () => {
    const provider = openaiCodexDescriptor.create({})

    await expect(provider.listModels()).rejects.toThrow(ConfigurationError)
    await expect(async () => {
      for await (const _chunk of provider.complete({ model: 'codex-mini', messages: [] })) {
        // consume
      }
    }).rejects.toThrow(ConfigurationError)
  })
})
