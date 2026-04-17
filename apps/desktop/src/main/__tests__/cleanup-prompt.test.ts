import { describe, expect, test } from 'vitest'
import { normalizeAboutMeSettings } from '../../shared/about-me'
import { defaultDictionarySettings, normalizeDictionarySettings } from '../../shared/dictionary'
import { buildCleanupSystemPrompt } from '../cleanup-prompt'

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

describe('buildCleanupSystemPrompt', () => {
  test('renders None blocks when dictionary and about me are empty', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' }
    })

    expect(prompt).toContain('Dictionary:\nNone.')
    expect(prompt).toContain('About the user:\nNone.')
    expect(prompt).toContain(
      'If the original speech is naturally list-like, step-based, or clearly easier to read as bullets or short structure, you may format it structurally.'
    )
  })

  test('serializes hotwords, replacements, notes, and inferred replacement type ordering', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: {
        entries: [
          {
            id: '1',
            term: 'Typeless',
            type: 'hotword',
            note: 'product name, preserve exact casing',
            usageCount: 9,
            createdAt: '',
            updatedAt: '2026-04-17T10:00:00.000Z'
          },
          {
            id: '2',
            term: 'open broca',
            type: 'replacement',
            replacement: 'OpenBroca',
            usageCount: 3,
            createdAt: '',
            updatedAt: '2026-04-17T09:00:00.000Z'
          },
          {
            id: '3',
            term: 'LLM',
            usageCount: 9,
            createdAt: '',
            updatedAt: '2026-04-17T11:00:00.000Z'
          },
          {
            id: '4',
            term: 'broca app',
            replacement: 'OpenBroca Desktop',
            note: 'desktop product name',
            usageCount: 6,
            createdAt: '',
            updatedAt: '2026-04-17T08:00:00.000Z'
          }
        ]
      },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' }
    })

    const dictionaryBlock = prompt.slice(
      prompt.indexOf('Dictionary:\n') + 'Dictionary:\n'.length,
      prompt.indexOf('\n\nAbout the user:\n')
    )

    expect(dictionaryBlock).toContain('hotword:\n- LLM\n- Typeless')
    expect(dictionaryBlock).toContain('replacement:\n- broca app => OpenBroca Desktop\n- open broca => OpenBroca')
    expect(dictionaryBlock).toContain(
      'notes:\n- Typeless: product name, preserve exact casing\n- broca app: desktop product name'
    )
  })

  test('serializes about me with stable lowercase keys for non-empty trimmed fields only', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: {
        nickname: '  Peiqiang  ',
        email: '   ',
        occupation: ' Software Engineer ',
        bio: ' Builds AI and voice tools '
      }
    })

    const aboutMeBlock = prompt.slice(
      prompt.indexOf('About the user:\n') + 'About the user:\n'.length
    )

    expect(aboutMeBlock).toContain('nickname: Peiqiang')
    expect(aboutMeBlock).toContain('occupation: Software Engineer')
    expect(aboutMeBlock).toContain('bio: Builds AI and voice tools')
    expect(aboutMeBlock).not.toContain('email:')
  })

  test('appends matched instructions after the core prompt blocks when present', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: {
        nickname: 'Peiqiang',
        email: 'liupeiqiang@example.com',
        occupation: 'Software Engineer',
        bio: 'Builds AI and voice tools'
      },
      matchedInstructionText: '  Use short chat-style replies.  '
    })

    const aboutMeBlockIndex = prompt.indexOf('About the user:')
    const matchedInstructionIndex = prompt.indexOf(
      'Matched app instructions:\nUse short chat-style replies.'
    )

    expect(matchedInstructionIndex).toBeGreaterThan(aboutMeBlockIndex)
  })
})
