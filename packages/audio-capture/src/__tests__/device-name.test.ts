import { describe, expect, test } from 'vitest'
import { normalizeAudioDeviceName } from '../device-name.js'

describe('normalizeAudioDeviceName', () => {
  test('keeps already valid UTF-8 device names intact', () => {
    expect(normalizeAudioDeviceName('MacBook Pro Microphone')).toBe('MacBook Pro Microphone')
    expect(normalizeAudioDeviceName('麦克风阵列 (Realtek(R) Audio)')).toBe('麦克风阵列 (Realtek(R) Audio)')
  })

  test('repairs latin1 mojibake produced from UTF-8 device names', () => {
    expect(normalizeAudioDeviceName('éº¦åé£éµå (Realtek(R) Audio)')).toBe(
      '麦克风阵列 (Realtek(R) Audio)'
    )
  })

  test('strips stray null bytes around device names', () => {
    expect(normalizeAudioDeviceName('\u0000USB Microphone\u0000')).toBe('USB Microphone')
  })
})
