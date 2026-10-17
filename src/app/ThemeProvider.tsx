import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeTokens } from '../types/domain'

const STORAGE_KEY = 'clube-aurora-demo-theme'

export const defaultTheme: ThemeTokens = {
  primary: '#5b3a73',
  accent: '#d7a85c',
  surface: '#f8f4ef',
  font: 'humanist',
  mode: 'light',
  clubName: 'Clube Aurora',
  monogram: 'CA',
  radius: 'round',
}

interface ThemeContextValue {
  theme: ThemeTokens
  setTheme: (theme: ThemeTokens) => void
  updateTheme: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void
  resetTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeTokens {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...defaultTheme, ...JSON.parse(stored) } : defaultTheme
  } catch {
    return defaultTheme
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeTokens>(readStoredTheme)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    const root = document.documentElement
    root.style.setProperty('--color-primary', theme.primary)
    root.style.setProperty('--color-accent', theme.accent)
    root.style.setProperty('--color-canvas', theme.mode === 'dark' ? '#17141a' : theme.surface)
    root.style.setProperty('--color-surface', theme.mode === 'dark' ? '#231f27' : '#ffffff')
    root.style.setProperty('--color-text', theme.mode === 'dark' ? '#f8f2ea' : '#27212b')
    root.style.setProperty('--color-muted', theme.mode === 'dark' ? '#b9aebc' : '#736b76')
    root.style.setProperty('--radius-card', theme.radius === 'round' ? '24px' : theme.radius === 'soft' ? '14px' : '4px')
    const fontMap = {
      humanist: "'Trebuchet MS', 'Segoe UI', sans-serif",
      editorial: "Georgia, 'Times New Roman', serif",
      modern: "Inter, ui-sans-serif, system-ui, sans-serif",
    }
    root.style.setProperty('--font-body', fontMap[theme.font])
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.primary)
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    updateTheme: (key, value) => setTheme((current) => ({ ...current, [key]: value })),
    resetTheme: () => setTheme(defaultTheme),
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return context
}
