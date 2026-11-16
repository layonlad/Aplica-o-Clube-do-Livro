import { it, expect } from 'vitest'
import { readingGesture } from './reader-gestures'
const start = { x: 180, y: 300, at: 0, width: 360 }
it('desliza nas duas direções e toca no centro/laterais', () => {
  expect(readingGesture(start, { x: 80, y: 305, at: 180 })).toBe('next')
  expect(readingGesture(start, { x: 280, y: 305, at: 180 })).toBe('previous')
  expect(readingGesture(start, { x: 182, y: 302, at: 100 })).toBe('controls')
  expect(readingGesture({ ...start, x: 60 }, { x: 60, y: 301, at: 100 })).toBe('previous')
  expect(readingGesture({ ...start, x: 300 }, { x: 300, y: 301, at: 100 })).toBe('next')
  expect(readingGesture({ ...start, x: 60 }, { x: 60, y: 301, at: 100 }, false)).toBe('controls')
})
it('preserva gestos do navegador, toque longo, movimentos verticais e gestos lentos', () => {
  for (const x of [1, 359])
    expect(readingGesture({ ...start, x }, { x: x + 70, y: 300, at: 180 })).toBeNull()
  expect(readingGesture(start, { x: 250, y: 440, at: 160 })).toBeNull()
  expect(readingGesture(start, { x: 180, y: 300, at: 800 })).toBeNull()
  expect(readingGesture(start, { x: 40, y: 301, at: 900 })).toBeNull()
})
