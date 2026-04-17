import { describe, expect, test } from 'vitest'
import { normalizeAboutMeSettings } from '../../shared/about-me'
import { defaultDictionarySettings, normalizeDictionarySettings } from '../../shared/dictionary'

describe('shared settings normalization', () => {
  test('normalizes about me fields to trimmed strings', () => {
    expect(
      normalizeAboutMeSettings({
        nickname: '  Peiqiang  ',
        email: 42,
        occupation: ' Engineer ',
        bio: null
      })
    ).toEqual({
      nickname: 'Peiqiang',
      email: '',
      occupation: 'Engineer',
      bio: ''
    })
  })

  test('drops invalid dictionary entries and trims valid values', () => {
    expect(
      normalizeDictionarySettings({
        entries: [
          { id: '1', term: ' Typeless ', type: 'hotword', usageCount: 3 },
          { id: '2', term: ' ', replacement: 'OpenBroca', usageCount: 1 },
          { id: '3', term: 'open broca', replacement: ' OpenBroca ', usageCount: 2 },
          { id: '   ', term: 'blank id should drop', usageCount: 4 },
          { term: 'missing id should drop', usageCount: 5 },
          { id: 42, term: 'non-string id should drop', usageCount: 6 }
        ]
      })
    ).toEqual({
      entries: [
        expect.objectContaining({
          id: '1',
          term: 'Typeless',
          type: 'hotword'
        }),
        expect.objectContaining({
          id: '3',
          term: 'open broca',
          replacement: 'OpenBroca'
        })
      ]
    })
  })

  test('returns a fresh empty dictionary object for invalid root payloads', () => {
    const first = normalizeDictionarySettings(null)
    first.entries.push({
      id: 'mutated',
      term: 'mutated',
      usageCount: 1,
      createdAt: '',
      updatedAt: ''
    })

    const second = normalizeDictionarySettings(undefined)

    expect(first).not.toBe(defaultDictionarySettings)
    expect(second).not.toBe(defaultDictionarySettings)
    expect(second).toEqual({ entries: [] })
  })

  test('normalizes invalid dictionary usageCount values to zero', () => {
    expect(
      normalizeDictionarySettings({
        entries: [
          { id: 'nan', term: 'NaN', usageCount: Number.NaN },
          { id: 'inf', term: 'Infinity', usageCount: Number.POSITIVE_INFINITY },
          { id: 'neg', term: 'Negative', usageCount: -10 },
          { id: 'ok', term: 'Valid', usageCount: 5 }
        ]
      })
    ).toEqual({
      entries: [
        expect.objectContaining({ id: 'nan', usageCount: 0 }),
        expect.objectContaining({ id: 'inf', usageCount: 0 }),
        expect.objectContaining({ id: 'neg', usageCount: 0 }),
        expect.objectContaining({ id: 'ok', usageCount: 5 })
      ]
    })
  })
})
