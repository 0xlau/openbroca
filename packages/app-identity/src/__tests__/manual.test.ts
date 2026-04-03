import { describe, expect, test } from 'vitest'
import { normalizeManualAppIdentity } from '../manual'

describe('normalizeManualAppIdentity', () => {
  test('keeps explicit stable ids and trims empty optional fields', () => {
    expect(
      normalizeManualAppIdentity({
        displayName: 'Internal Tool',
        platform: 'windows',
        stableId: 'Contoso.InternalTool',
        bundleId: '   ',
        aumid: 'Contoso.InternalTool',
        path: ''
      })
    ).toEqual({
      id: 'Contoso.InternalTool',
      displayName: 'Internal Tool',
      platform: 'windows',
      aumid: 'Contoso.InternalTool',
      source: 'manual'
    })
  })

  test('throws when stableId is blank', () => {
    expect(() =>
      normalizeManualAppIdentity({
        displayName: 'Empty Id',
        platform: 'macos',
        stableId: '   '
      })
    ).toThrow('Manual app entry requires a stable id')
  })
})
