/** Local developer measurements. Names identify only the type of operation. */
export function measureApp(name: 'api-read' | 'api-write' | 'image-preview' | 'image-full' | 'tab-render', start: number) {
  const label = `clube:${name}`
  try {
    performance.clearMeasures(label)
    performance.measure(label, { start, end: performance.now() })
  } catch { /* Unsupported Performance API should not affect the app. */ }
}
