import { describe, expect, test } from 'vitest'
import { dedupeAppIdentities, normalizeDetectedAppIdentity } from '../normalize'

describe('normalizeDetectedAppIdentity', () => {
  test('prefers bundleId on macOS and aumid on Windows', () => {
    expect(
      normalizeDetectedAppIdentity({
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        path: '/Applications/Cursor.app',
        source: 'detected'
      })
    ).toMatchObject({
      id: 'com.todesktop.230313mzl4w4u92',
      displayName: 'Cursor'
    })

    expect(
      normalizeDetectedAppIdentity({
        displayName: 'ChatGPT',
        platform: 'windows',
        aumid: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT',
        path: 'C:\\Program Files\\WindowsApps\\ChatGPT.exe',
        source: 'detected'
      })
    ).toMatchObject({
      id: 'OpenAI.ChatGPT_2p2nqsd0c76g0!ChatGPT',
      displayName: 'ChatGPT'
    })
  })

  test('falls back to path and dedupes by normalized id', () => {
    const identities = dedupeAppIdentities([
      normalizeDetectedAppIdentity({
        displayName: 'Chrome',
        platform: 'windows',
        path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        source: 'detected'
      }),
      normalizeDetectedAppIdentity({
        displayName: 'Google Chrome',
        platform: 'windows',
        path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        source: 'detected'
      })
    ])

    expect(identities).toHaveLength(1)
    expect(identities[0]?.id).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })

  test('prefers stable ids when mixed observations share a path', () => {
    const identities = dedupeAppIdentities([
      normalizeDetectedAppIdentity({
        displayName: 'Drive',
        platform: 'windows',
        path: 'C:\\Program Files\\Drive\\drive.exe',
        source: 'detected'
      }),
      normalizeDetectedAppIdentity({
        displayName: 'Drive',
        platform: 'windows',
        path: 'C:\\Program Files\\Drive\\drive.exe',
        aumid: 'Contoso.Drive_123!App',
        source: 'detected'
      })
    ])

    expect(identities).toHaveLength(1)
    expect(identities[0]?.id).toBe('Contoso.Drive_123!App')
  })

  test('throws when no stable id is available', () => {
    expect(() =>
      normalizeDetectedAppIdentity({
        displayName: 'Unknown',
        platform: 'windows',
        source: 'detected'
      })
    ).toThrow(/Unable to derive stable app id/)
  })
})
