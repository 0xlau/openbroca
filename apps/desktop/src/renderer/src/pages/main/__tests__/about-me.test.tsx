// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'
import type { PersistedStoreState } from '@renderer/stores/create-persisted-store'

type AboutMeProfile = {
  nickname: string
  email: string
  occupation: string
  bio: string
}

const initialProfile: AboutMeProfile = {
  nickname: 'Taylor',
  email: 'taylor@example.com',
  occupation: 'Engineer',
  bio: 'Likes local-first tools.'
}

let aboutMeStoreMock: ReturnType<typeof createMockStore>

function createMockStore(data: AboutMeProfile) {
  return createStore<PersistedStoreState<AboutMeProfile>>((set, get) => ({
    data,
    isHydrated: true,
    update: vi.fn(async (partial) => {
      set({ data: { ...get().data, ...partial } })
    }),
    replace: vi.fn(async (nextData) => {
      set({ data: nextData })
    }),
    hydrate: vi.fn(async () => {})
  }))
}

vi.mock('@renderer/stores/about-me-store', () => ({
  defaultAboutMeSettings: {
    nickname: '',
    email: '',
    occupation: '',
    bio: ''
  },
  get aboutMeStore() {
    return aboutMeStoreMock
  }
}))

describe('AboutMe', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()
    aboutMeStoreMock = createMockStore(initialProfile)
  })

  test('hides save changes when the form matches persisted data', async () => {
    const { AboutMe } = await import('../about-me')

    render(<AboutMe />)

    expect(screen.getByDisplayValue('Taylor')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  test('shows save changes only after edits and hides it again after saving', async () => {
    const { AboutMe } = await import('../about-me')

    render(<AboutMe />)

    fireEvent.change(screen.getByLabelText('My nickname'), {
      target: { value: 'Taylor Swift' }
    })

    const saveButton = await screen.findByRole('button', { name: 'Save changes' })
    expect(saveButton).toBeTruthy()

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(aboutMeStoreMock.getState().update).toHaveBeenCalledWith({
        nickname: 'Taylor Swift',
        email: 'taylor@example.com',
        occupation: 'Engineer',
        bio: 'Likes local-first tools.'
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    })
  })

  test('constrains and centers the page content', async () => {
    const { AboutMe } = await import('../about-me')

    const { container } = render(<AboutMe />)

    expect(container.firstElementChild?.className).toContain('max-w-5xl')
    expect(container.firstElementChild?.className).toContain('mx-auto')
  })

  test('renders occupation and bio as textareas with at least three visible rows', async () => {
    const { AboutMe } = await import('../about-me')

    render(<AboutMe />)

    const occupationField = screen.getByLabelText('My occupation')
    const bioField = screen.getByLabelText('More about me')

    expect(occupationField.tagName).toBe('TEXTAREA')
    expect(bioField.tagName).toBe('TEXTAREA')
    expect(occupationField.getAttribute('rows')).toBe('3')
    expect(bioField.getAttribute('rows')).toBe('3')
  })
})
