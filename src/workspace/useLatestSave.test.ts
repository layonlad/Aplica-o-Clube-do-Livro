import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useLatestSave } from './useLatestSave'

it('não transfere uma gravação pendente para outro contexto de leitura', async () => {
  vi.useFakeTimers()
  try {
    let finish!: (ok: boolean) => void
    const original = vi.fn().mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
      .mockResolvedValue(true)
    const other = vi.fn().mockResolvedValue(true)
    const { result, rerender } = renderHook(({ save }) => useLatestSave(save), { initialProps: { save: original } })
    act(() => result.current(() => ({ type: 'reading.update', id: 'book', percent: 12 })))
    rerender({ save: other })
    await act(async () => {
      finish(false)
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(original).toHaveBeenCalledTimes(2)
    expect(other).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})
