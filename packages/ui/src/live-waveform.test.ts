import { describe, expect, test } from 'vitest'

import {
  buildStaticWaveformBars,
  getCenteredBarStartX,
  getFittingBarCount
} from './live-waveform'

describe('buildStaticWaveformBars', () => {
  test('keeps odd bar counts fully populated and mirrored around the center', () => {
    const source = Uint8Array.from([0, 32, 64, 96, 128, 160, 192, 224, 255])

    const bars = buildStaticWaveformBars(source, 13, 1)

    expect(bars).toHaveLength(13)
    expect(bars[0]).toBe(bars[12])
    expect(bars[1]).toBe(bars[11])
    expect(bars[2]).toBe(bars[10])
    expect(bars[3]).toBe(bars[9])
    expect(bars[4]).toBe(bars[8])
    expect(bars[5]).toBe(bars[7])
    expect(bars[6]).toBeGreaterThanOrEqual(0.05)
  })
})

describe('getCenteredBarStartX', () => {
  test('centers rendered bars within the available width', () => {
    expect(getCenteredBarStartX(53, 13, 2, 2)).toBe(1.5)
    expect(getCenteredBarStartX(48, 12, 2, 2)).toBe(1)
  })
})

describe('getFittingBarCount', () => {
  test('counts the last bar without requiring an extra trailing gap', () => {
    expect(getFittingBarCount(1, 2, 2)).toBe(0)
    expect(getFittingBarCount(47, 2, 2)).toBe(12)
    expect(getFittingBarCount(48, 2, 2)).toBe(12)
    expect(getFittingBarCount(53, 2, 2)).toBe(13)
  })
})
