import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom does not implement the browser's viewport scrolling API.
Object.defineProperty(window,'scrollTo',{value:vi.fn(),writable:true})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})
