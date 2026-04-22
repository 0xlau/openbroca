// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, waitFor, within } from '@testing-library/react'

vi.mock('@openbroca/ui', () => ({
  Button: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button className={className}>{children}</button>
  ),
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')
}))

describe('NotifyWindow', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('renders the notification title, body, and action area', async () => {
    window.api = {
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn()
      },
      providerAuth: {
        connect: vi.fn(),
        disconnect: vi.fn()
      },
      listeningSession: {
        cancelCapture: vi.fn(),
        cancelProcessing: vi.fn(),
        finishCapture: vi.fn(),
        getState: vi.fn().mockResolvedValue({
          state: { status: 'idle' },
          targetApp: null
        }),
        onStateChange: vi.fn(() => vi.fn())
      },
      notifyWindow: {
        getState: vi.fn().mockResolvedValue({
          notification: {
            title: 'Copied to clipboard',
            body: 'Paste it into the target app',
            actions: [{ id: 'dismiss', label: 'Dismiss' }]
          }
        }),
        onStateChange: vi.fn(() => vi.fn())
      }
    }

    const { NotifyWindow } = await import('../notify-window')
    const view = render(<NotifyWindow />)

    await waitFor(() => {
      expect(within(view.container).getByText('Copied to clipboard')).toBeTruthy()
    })

    expect(within(view.container).getByText('Paste it into the target app')).toBeTruthy()
    expect(within(view.container).getByTestId('notify-window-actions')).toBeTruthy()
    expect(within(view.container).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  test('does not render the action area when the notification has no actions', async () => {
    window.api = {
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn()
      },
      providerAuth: {
        connect: vi.fn(),
        disconnect: vi.fn()
      },
      listeningSession: {
        cancelCapture: vi.fn(),
        cancelProcessing: vi.fn(),
        finishCapture: vi.fn(),
        getState: vi.fn().mockResolvedValue({
          state: { status: 'idle' },
          targetApp: null
        }),
        onStateChange: vi.fn(() => vi.fn())
      },
      notifyWindow: {
        getState: vi.fn().mockResolvedValue({
          notification: {
            title: 'Copied to clipboard'
          }
        }),
        onStateChange: vi.fn(() => vi.fn())
      }
    }

    const { NotifyWindow } = await import('../notify-window')
    const view = render(<NotifyWindow />)

    await waitFor(() => {
      expect(within(view.container).getByText('Copied to clipboard')).toBeTruthy()
    })

    expect(within(view.container).queryByTestId('notify-window-actions')).toBeNull()
    expect(within(view.container).queryByRole('button')).toBeNull()
  })
})
