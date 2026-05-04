// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useHoldDetection, useQuickTapDetection } from '../shortcuts-detection'

describe('useQuickTapDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  function Harness(props: {
    active: boolean
    modifierKey: 'Meta' | 'Control'
    onDetected: () => void
  }): React.ReactElement {
    useQuickTapDetection(props)
    return <div />
  }

  test('detects two Meta keydowns within 300ms', () => {
    const onDetected = vi.fn()
    render(<Harness active={true} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    vi.advanceTimersByTime(100)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    expect(onDetected).toHaveBeenCalledTimes(1)
  })

  test('does not fire when gap exceeds 300ms', () => {
    const onDetected = vi.fn()
    render(<Harness active={true} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    vi.advanceTimersByTime(400)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    expect(onDetected).not.toHaveBeenCalled()
  })

  test('ignores keydown with repeat: true', () => {
    const onDetected = vi.fn()
    render(<Harness active={true} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', repeat: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', repeat: true }))
    expect(onDetected).not.toHaveBeenCalled()
  })

  test('does not attach listener when active=false', () => {
    const onDetected = vi.fn()
    render(<Harness active={false} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    expect(onDetected).not.toHaveBeenCalled()
  })
})

describe('useHoldDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  function Harness(props: {
    active: boolean
    modifierKey: 'Meta' | 'Control'
    onDetected: () => void
  }): React.ReactElement {
    useHoldDetection(props)
    return <div />
  }

  test('detects Meta+Space held for >=500ms', () => {
    const onDetected = vi.fn()
    render(<Harness active={true} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
    vi.advanceTimersByTime(600)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    expect(onDetected).toHaveBeenCalledTimes(1)
  })

  test('does not fire if hold is shorter than 500ms', () => {
    const onDetected = vi.fn()
    render(<Harness active={true} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
    vi.advanceTimersByTime(200)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    expect(onDetected).not.toHaveBeenCalled()
  })

  test('does not attach listener when active=false', () => {
    const onDetected = vi.fn()
    render(<Harness active={false} modifierKey="Meta" onDetected={onDetected} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
    vi.advanceTimersByTime(800)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }))
    expect(onDetected).not.toHaveBeenCalled()
  })
})
