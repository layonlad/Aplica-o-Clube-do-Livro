import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeTokens } from '../types/domain'

const STORAGE_KEY = 'clube-aurora-demo-theme'

export const defaultTheme: ThemeTokens = {
  primary: '#462b70',
  accent: '#fc7667',
  surface: '#fbf4e8',
  font: 'humanist',
  mode: 'light',
  clubName: 'Clube Aurora',
  monogram: 'CA',
  radius: 'round',
}

/** Valores padrão da identidade anterior. Quem nunca personalizou recebe a nova paleta. */
const legacyDefaults: Partial<Record<keyof ThemeTokens, string>> = { primary: '#5b3a73', accent: '#d7a85c', surface: '#f8f4ef' }

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
    if (!stored) return defaultTheme
    const parsed = { ...defaultTheme, ...JSON.parse(stored) } as ThemeTokens
    for (const [key, legacy] of Object.entries(legacyDefaults) as [keyof ThemeTokens, string][]) {
      if (String(parsed[key]).toLowerCase() === legacy) (parsed[key] as string) = defaultTheme[key] as string
    }
    return parsed
  } catch {
    return defaultTheme
  }
}

const fontMap: Record<ThemeTokens['font'], string | null> = {
  humanist: null, // Plus Jakarta Sans (padrão do design system)
  editorial: "var(--font-display)",
  modern: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
}

const radiusMap: Record<ThemeTokens['radius'], string> = { round: 'var(--radius-lg)', soft: 'var(--radius-md)', square: 'var(--radius-xs)' }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeTokens>(readStoredTheme)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)) } catch { /* armazenamento indisponível */ }
    const root = document.documentElement
    const dark = theme.mode === 'dark'
    root.dataset.theme = theme.mode
    const set = (name: string, value: string | null) => value ? root.style.setProperty(name, value) : root.style.removeProperty(name)

    const customPrimary = theme.primary.toLowerCase() !== defaultTheme.primary
    set('--brand', customPrimary ? (dark ? `color-mix(in srgb, ${theme.primary} 55%, white)` : theme.primary) : null)
    set('--brand-hover', customPrimary ? `color-mix(in srgb, ${theme.primary} 82%, ${dark ? 'white' : 'black'})` : null)
    set('--brand-ink', customPrimary ? (dark ? `color-mix(in srgb, ${theme.primary} 50%, white)` : theme.primary) : null)
    set('--brand-soft', customPrimary ? `color-mix(in srgb, ${theme.primary} ${dark ? 18 : 10}%, var(--surface))` : null)
    set('--accent', theme.accent.toLowerCase() !== defaultTheme.accent ? theme.accent : null)
    set('--bg', !dark && theme.surface.toLowerCase() !== defaultTheme.surface ? theme.surface : null)
    set('--radius-card', radiusMap[theme.radius])
    set('--font-ui', fontMap[theme.font])
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17111f' : theme.primary)
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
