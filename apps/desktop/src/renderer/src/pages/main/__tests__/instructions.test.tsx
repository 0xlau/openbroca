// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore } from 'zustand'
import React from 'react'
import type { AppIdentity } from '@openbroca/app-identity'
import type { PersistedStoreState } from '@renderer/stores/create-persisted-store'
import type { InstructionsSettings } from '../../../../../shared/instructions'

type InstructionsStoreState = PersistedStoreState<InstructionsSettings>

let instructionsStoreMock: ReturnType<typeof createInstructionsStore>
let detectedApps: AppIdentity[] = []
const { commandItemSpy } = vi.hoisted(() => ({
  commandItemSpy: vi.fn<(input: { value?: string; disabled?: boolean }) => void>()
}))

function createInstructionsStore(data: InstructionsSettings) {
  return createStore<InstructionsStoreState>((set, get) => ({
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

const SelectContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  value?: string
  setValue: (value: string) => void
} | null>(null)
const PopoverContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
} | null>(null)

vi.mock('@renderer/stores/instructions-store', () => ({
  get instructionsStore() {
    return instructionsStoreMock
  }
}))

vi.mock('@renderer/trpc', () => ({
  trpc: {
    appIdentity: {
      listApps: {
        useQuery: () => ({
          data: detectedApps,
          isLoading: false
        })
      }
    }
  }
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => null
}))

vi.mock('@openbroca/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    type = 'button',
    disabled,
    ...props
  }: React.ComponentProps<'button'>) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: React.ComponentProps<'div'>) => <h3 {...props}>{children}</h3>,
  CardDescription: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <p {...props}>{children}</p>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardFooter: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardAction: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({
    value,
    onValueChange,
    placeholder
  }: {
    value?: string
    onValueChange?: (value: string) => void
    placeholder?: string
  }) => (
    <input
      aria-label={placeholder ?? 'Search'}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    className,
    value,
    disabled,
    onSelect
  }: {
    children: React.ReactNode
    className?: string
    value?: string
    disabled?: boolean
    onSelect?: (value: string) => void
  }) => {
    commandItemSpy({ value, disabled })

    return (
      <div
        className={className}
        data-value={value}
        data-disabled={disabled}
        onClick={() => {
          if (disabled) {
            return
          }
          onSelect?.(value ?? '')
        }}
      >
        {children}
      </div>
    )
  },
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CommandSeparator: () => <hr />,
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Empty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  EmptyHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  FieldGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FieldContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FieldLabel: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  FieldDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children
  }: {
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => {
    const [open, setOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const selectedValue = value ?? internalValue

    return (
      <SelectContext.Provider
        value={{
          open,
          setOpen,
          value: selectedValue,
          setValue: (nextValue) => {
            if (value === undefined) {
              setInternalValue(nextValue)
            }
            onValueChange?.(nextValue)
          }
        }}
      >
        {children}
      </SelectContext.Provider>
    )
  },
  SelectTrigger: ({ children, onClick, disabled, ...props }: React.ComponentProps<'button'>) => {
    const context = React.useContext(SelectContext)
    return (
      <button
        type="button"
        role="combobox"
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event)
          if (!disabled) {
            context?.setOpen((current) => !current)
          }
        }}
        {...props}
      >
        {children}
      </button>
    )
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    const context = React.useContext(SelectContext)
    return <span>{context?.value ?? placeholder}</span>
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => {
    const context = React.useContext(SelectContext)
    return context?.open ? <div>{children}</div> : null
  },
  SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
    const context = React.useContext(SelectContext)
    return (
      <button
        type="button"
        onClick={() => {
          context?.setValue(value)
          context?.setOpen(false)
        }}
      >
        {children}
      </button>
    )
  },
  Popover: ({
    open,
    defaultOpen,
    onOpenChange,
    children
  }: {
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => {
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
    const isControlled = open !== undefined
    const currentOpen = isControlled ? open : internalOpen

    return (
      <PopoverContext.Provider
        value={{
          open: currentOpen,
          setOpen: (nextValue) => {
            const resolvedValue =
              typeof nextValue === 'function'
                ? (nextValue as (current: boolean) => boolean)(currentOpen)
                : nextValue

            if (!isControlled) {
              setInternalOpen(resolvedValue)
            }
            onOpenChange?.(resolvedValue)
          }
        }}
      >
        {children}
      </PopoverContext.Provider>
    )
  },
  PopoverTrigger: ({
    asChild,
    children,
    ...props
  }: React.ComponentProps<'button'> & { asChild?: boolean }) => {
    const context = React.useContext(PopoverContext)
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ onClick?: React.MouseEventHandler }>
      return React.cloneElement(child, {
        ...props,
        onClick: (event) => {
          child.props.onClick?.(event)
          context?.setOpen((current) => !current)
        }
      })
    }

    return (
      <button type="button" {...props} onClick={() => context?.setOpen((current) => !current)}>
        {children}
      </button>
    )
  },
  PopoverContent: ({ children, ...props }: React.ComponentProps<'div'>) => {
    const context = React.useContext(PopoverContext)
    return context?.open ? <div {...props}>{children}</div> : null
  },
  Switch: ({
    id,
    checked,
    onCheckedChange
  }: {
    id?: string
    checked?: boolean
    onCheckedChange?: (next: boolean) => void
  }) => (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
  TypographyH3: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  TypographyMuted: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  TypographySmall: ({ children }: { children: React.ReactNode }) => <p>{children}</p>
}))

describe('Instructions', () => {
  beforeEach(() => {
    vi.resetModules()
    cleanup()

    instructionsStoreMock = createInstructionsStore({
      rules: []
    })
    commandItemSpy.mockReset()

    detectedApps = [
      {
        id: 'com.todesktop.230313mzl4w4u92',
        displayName: 'Cursor',
        platform: 'macos',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        source: 'detected'
      },
      {
        id: 'company.thebrowser.Browser',
        displayName: 'Arc',
        platform: 'macos',
        bundleId: 'company.thebrowser.Browser',
        iconDataUrl: 'data:image/png;base64,ZmFrZQ==',
        source: 'detected'
      }
    ]
  })

  test('renders a grid-and-card instructions layout', async () => {
    instructionsStoreMock = createInstructionsStore({
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding focus',
          activationApps: [detectedApps[0]],
          customInstructions: 'Prefer concise technical language.',
          autoEnterMode: 'enter'
        },
        {
          id: 'rule-writing',
          name: 'Writing focus',
          activationApps: [detectedApps[1]],
          customInstructions: 'Use reader-friendly style.',
          autoEnterMode: 'mod-enter'
        }
      ]
    })

    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    expect(screen.getByRole('heading', { name: 'Instructions' })).toBeTruthy()
    expect(screen.getByText('Coding focus')).toBeTruthy()
    expect(screen.getByText('Auto enter Enter')).toBeTruthy()
    expect(screen.getByText('Auto enter Cmd/Ctrl + Enter')).toBeTruthy()
    expect(screen.getByTestId('instructions-grid')).toBeTruthy()
    expect(
      screen.getByTestId('instruction-card-app-icon-placeholder-com.todesktop.230313mzl4w4u92')
    ).toBeTruthy()
  })

  test('creates a new instruction rule', async () => {
    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Writing focus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Arc' }))
    fireEvent.change(screen.getByLabelText('Custom instructions'), {
      target: { value: 'Use reader-friendly style.' }
    })
    fireEvent.click(screen.getByRole('switch', { name: 'Auto enter' }))
    const createButtons = screen.getAllByRole('button', { name: 'Create instruction' })
    fireEvent.click(createButtons[createButtons.length - 1] as HTMLButtonElement)

    await waitFor(() => {
      expect(instructionsStoreMock.getState().replace).toHaveBeenCalledTimes(1)
    })

    const nextSettings = vi.mocked(instructionsStoreMock.getState().replace).mock.calls[0]?.[0]
    expect(nextSettings.rules).toHaveLength(1)
    expect(nextSettings.rules[0]).toMatchObject({
      name: 'Writing focus',
      activationApps: [expect.objectContaining({ id: 'company.thebrowser.Browser' })],
      customInstructions: 'Use reader-friendly style.',
      autoEnterMode: 'enter'
    })
  })

  test('creates a new instruction rule with auto-enter send key mode', async () => {
    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Terminal flow' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Arc' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Auto enter' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Send key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cmd/Ctrl + Enter' }))
    const createButtons = screen.getAllByRole('button', { name: 'Create instruction' })
    fireEvent.click(createButtons[createButtons.length - 1] as HTMLButtonElement)

    await waitFor(() => {
      expect(instructionsStoreMock.getState().replace).toHaveBeenCalledTimes(1)
    })

    const nextSettings = vi.mocked(instructionsStoreMock.getState().replace).mock.calls[0]?.[0]
    expect(nextSettings.rules[0]).toMatchObject({
      name: 'Terminal flow',
      autoEnterMode: 'mod-enter'
    })
  })

  test('renders activation apps label row with Select apps trigger and no manual action', async () => {
    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))

    expect(screen.getByText('Activation apps')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select apps' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add manual app' })).toBeNull()
  })

  test('uses a compact activation app popover container', async () => {
    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))

    const popover = screen.getByTestId('activation-app-popover')
    expect(popover.className).toContain('w-80')
    expect(popover.className).toContain('max-h-[min(50vh,360px)]')
    expect(popover.className).toContain('overflow-y-auto')
  })

  test('edits and deletes an existing instruction', async () => {
    instructionsStoreMock = createInstructionsStore({
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding focus',
          activationApps: [detectedApps[0]],
          customInstructions: 'Prefer concise technical language.',
          autoEnterMode: 'enter'
        }
      ]
    })

    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Coding focus' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Deep coding focus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(instructionsStoreMock.getState().replace).toHaveBeenCalledTimes(1)
    })

    const afterEdit = vi.mocked(instructionsStoreMock.getState().replace).mock.calls[0]?.[0]
    expect(afterEdit.rules[0]).toMatchObject({
      id: 'rule-coding',
      name: 'Deep coding focus'
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Deep coding focus' }))

    await waitFor(() => {
      expect(instructionsStoreMock.getState().replace).toHaveBeenCalledTimes(2)
    })

    const afterDelete = vi.mocked(instructionsStoreMock.getState().replace).mock.calls[1]?.[0]
    expect(afterDelete.rules).toHaveLength(0)
  })

  test('disables apps owned by another rule and still allows selecting other detected apps', async () => {
    instructionsStoreMock = createInstructionsStore({
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding focus',
          activationApps: [detectedApps[0]],
          customInstructions: 'Prefer concise technical language.',
          autoEnterMode: 'enter'
        }
      ]
    })

    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))

    expect(
      (screen.getByRole('button', { name: 'Add Cursor (owned by Coding focus)' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Add Arc' }))
    expect(screen.getByRole('button', { name: 'Remove Arc' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Arc writing' } })
    const createButtons = screen.getAllByRole('button', { name: 'Create instruction' })
    fireEvent.click(createButtons[createButtons.length - 1] as HTMLButtonElement)

    await waitFor(() => {
      expect(instructionsStoreMock.getState().replace).toHaveBeenCalledTimes(1)
    })

    expect(
      commandItemSpy.mock.calls.some(
        ([input]) => input.value?.includes('cursor') && input.disabled === true
      )
    ).toBe(true)

    const nextSettings = vi.mocked(instructionsStoreMock.getState().replace).mock.calls[0]?.[0]
    expect(nextSettings.rules).toHaveLength(2)
    expect(nextSettings.rules[1]).toMatchObject({
      name: 'Arc writing',
      activationApps: [
        expect.objectContaining({
          id: 'company.thebrowser.Browser',
          displayName: 'Arc',
          source: 'detected'
        })
      ]
    })
  })

  test('opens activation app popover and renders app icon states', async () => {
    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'New instruction' }))

    expect(screen.queryByRole('button', { name: 'Add Arc' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))

    expect(screen.getByRole('button', { name: 'Add Arc' })).toBeTruthy()
    expect(screen.getByAltText('Arc icon')).toBeTruthy()
    expect(screen.getByTestId('activation-app-icon-placeholder-com.todesktop.230313mzl4w4u92')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'arc' } })
    expect((screen.getByLabelText('Search apps') as HTMLInputElement).value).toBe('arc')
    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
    expect(screen.queryByRole('button', { name: 'Add Arc' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Select apps' }))
    expect((screen.getByLabelText('Search apps') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByText('Arc'))

    expect(screen.getByRole('button', { name: 'Remove Arc' }).parentElement?.textContent).toContain('Arc')
    expect(
      screen
        .getByRole('button', { name: 'Remove Arc' })
        .parentElement?.querySelector('img[alt="Arc icon"]')
    ).toBeTruthy()
  })

  test('rolls back optimistic delete when persistence fails', async () => {
    instructionsStoreMock = createInstructionsStore({
      rules: [
        {
          id: 'rule-coding',
          name: 'Coding focus',
          activationApps: [detectedApps[0]],
          customInstructions: 'Prefer concise technical language.',
          autoEnterMode: 'enter'
        }
      ]
    })

    vi.mocked(instructionsStoreMock.getState().replace).mockImplementationOnce(async (nextData) => {
      instructionsStoreMock.setState((state) => ({
        ...state,
        data: nextData
      }))

      throw new Error('persist failed')
    })

    const { Instructions } = await import('../instructions')

    render(<Instructions />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Coding focus' }))

    await waitFor(() => {
      expect(screen.getByText('persist failed')).toBeTruthy()
    })

    expect(screen.getByText('Coding focus')).toBeTruthy()
    expect(instructionsStoreMock.getState().data.rules).toHaveLength(1)
  })
})
