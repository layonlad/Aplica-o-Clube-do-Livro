export interface ReadingGesture {
  x: number
  y: number
  at: number
  width: number
}
/** Browser edge gestures, selection, long presses, vertical pans and pinches stay with the browser. */
export function readingGesture(
  start: ReadingGesture,
  end: { x: number; y: number; at: number },
  edgeTaps = true,
): 'next' | 'previous' | 'controls' | null {
  if (start.x < 20 || start.x > start.width - 20) return null
  const dx = end.x - start.x,
    dy = end.y - start.y,
    duration = end.at - start.at
  if (duration < 800 && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.6)
    return dx < 0 ? 'next' : 'previous'
  if (duration > 350 || Math.hypot(dx, dy) > 12) return null
  if (edgeTaps && start.x < start.width * 0.25) return 'previous'
  if (edgeTaps && start.x > start.width * 0.75) return 'next'
  return 'controls'
}
