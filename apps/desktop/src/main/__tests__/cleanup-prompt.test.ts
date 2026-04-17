import { describe, expect, test } from 'vitest'
import { normalizeAboutMeSettings } from '../../shared/about-me'
import { defaultDictionarySettings, normalizeDictionarySettings } from '../../shared/dictionary'
import { defaultPromptTemplateText } from '../../shared/prompt-template'
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
  test('resolves default template placeholders from runtime context', () => {
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
      aboutMe: {
        nickname: 'Liu',
        email: 'liupeiqiang@example.com',
        occupation: 'Software Engineer',
        bio: 'Builds AI and voice tools'
      }
    })

    expect(prompt).toContain('Primary goal:')
    expect(prompt).toContain('Output principles:')
    expect(prompt).toContain('Dictionary rules:')
    expect(prompt).toContain('User facts:')
    expect(prompt).toContain('Hard constraints:')
    expect(prompt).toContain('Dictionary:\nhotword:\n- LLM\n- Typeless')
    expect(prompt).toContain('replacement:\n- broca app => OpenBroca Desktop\n- open broca => OpenBroca')
    expect(prompt).toContain('notes:\n- Typeless: product name, preserve exact casing')
    expect(prompt).toContain('About the user:\nnickname: Liu')
    expect(prompt).not.toContain('{{raw_transcript}}')
    expect(prompt).not.toContain('The transcript content will be injected from')
  })

  test('falls back to shared default template when custom template is empty', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' },
      template: ''
    } as never)

    expect(prompt).toContain(defaultPromptTemplateText.split('\n')[0] ?? '')
  })

  test('falls back to shared default template when custom template is whitespace-only', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' },
      template: ' \n\t '
    } as never)

    expect(prompt).toContain(defaultPromptTemplateText.split('\n')[0] ?? '')
  })

  test('uses saved custom template and resolves known nested placeholders', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: {
        entries: [
          {
            id: '1',
            term: '  Open\nBroca  ',
            type: 'replacement',
            replacement: '  Open\r\nBroca Desktop ',
            note: ' keep\nas canonical ',
            usageCount: 1,
            createdAt: '',
            updatedAt: '2026-04-17T10:00:00.000Z'
          }
        ]
      },
      aboutMe: {
        nickname: '  Pei\nqiang  ',
        email: ' test\r\n@example.com ',
        occupation: ' Engineer\n ',
        bio: '\n Builds voice tools \r\n'
      },
      matchedInstructionText: '\n- Keep concise\r\n- Avoid bullets\n',
      template: [
        'HOTWORDS={{dictionary.hotwords}}',
        'REPLACEMENTS={{dictionary.replacements}}',
        'NOTES={{dictionary.notes}}',
        'ABOUT={{about_me}}',
        'EMAIL={{about_me.email}}',
        'MATCHED={{matched_instructions.text}}'
      ].join('\n')
    } as never)

    expect(prompt).toContain('HOTWORDS=')
    expect(prompt).toContain('REPLACEMENTS=- Open Broca => Open Broca Desktop')
    expect(prompt).toContain('NOTES=- Open Broca: keep as canonical')
    expect(prompt).toContain(
      'ABOUT=nickname: Pei qiang\nemail: test @example.com\noccupation: Engineer\nbio: Builds voice tools'
    )
    expect(prompt).toContain('EMAIL=test @example.com')
    expect(prompt).toContain('MATCHED=- Keep concise - Avoid bullets')
    expect(prompt).not.toContain('\u2028')
    expect(prompt).not.toContain('\u2029')
  })

  test('resolves planned and unknown placeholders to empty strings', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: { nickname: 'Liu', email: '', occupation: '', bio: '' },
      template: 'A={{about_me.nickname}} B={{raw_transcript}} C={{not_defined}} D={{matched_instructions}}'
    } as never)

    expect(prompt).toBe('A=Liu B= C= D=')
  })

  test('includes matched instructions section after about-user block and degrades safely when empty', () => {
    const withMatch = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' },
      matchedInstructionText: '  Keep concise.  '
    })
    const noMatch = buildCleanupSystemPrompt({
      dictionary: { entries: [] },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' },
      matchedInstructionText: null
    })

    expect(withMatch).toContain('Matched app instructions:')
    expect(withMatch).toContain('Keep concise.')
    expect(withMatch.indexOf('Matched app instructions:')).toBeGreaterThan(
      withMatch.indexOf('About the user:')
    )
    expect(noMatch).toContain('Matched app instructions:')
  })

  test('does not emit orphan notes for malformed replacement entries that are excluded', () => {
    const prompt = buildCleanupSystemPrompt({
      dictionary: {
        entries: [
          {
            id: 'bad-replacement',
            term: 'bad term',
            type: 'replacement',
            note: 'should not appear',
            usageCount: 10,
            createdAt: '',
            updatedAt: '2026-04-17T10:00:00.000Z'
          }
        ]
      },
      aboutMe: { nickname: '', email: '', occupation: '', bio: '' },
      template: 'notes={{dictionary.notes}}'
    } as never)

    expect(prompt).toBe('notes=')
  })
})
