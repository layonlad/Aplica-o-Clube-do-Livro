import { createContext, useCallback, useContext, useEffect, useMemo, useLayoutEffect, useState, type ReactNode } from 'react'
import type { ThemeTokens } from '../types/domain'
import { appearanceSchema } from '../../server/src/appearance-schema'
import { APPEARANCE_KEY, applyAppearance, defaultAppearance, normalizeAppearance, type Appearance } from './appearance'

const STORAGE_KEY = 'clube-aurora-demo-theme'

export const defaultTheme: ThemeTokens = {
  primary: '#9a4167',
  accent: '#e897b4',
  surface: '#fbf5e6',
  font: 'humanist',
  mode: 'light',
  clubName: 'Clube Aurora',
  monogram: 'CA',
  radius: 'round',
}

/** Valores padrão das identidades anteriores (original e "Lombadas"). Quem nunca personalizou recebe a paleta atual. */
const legacyDefaults: Partial<Record<keyof ThemeTokens, string[]>> = {
  primary: ['#5b3a73', '#462b70'],
  accent: ['#d7a85c', '#fc7667'],
  surface: ['#f8f4ef', '#fbf4e8'],
}

interface ThemeContextValue {
  /** Tema do protótipo de demonstração (nome do clube, monograma e cores livres). */
  theme: ThemeTokens
  setTheme: (theme: ThemeTokens) => void
  updateTheme: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void
  resetTheme: () => void
  /** Aparência salva da conta/navegador. */
  appearance: Appearance
  /** Grava uma nova aparência (aplica e guarda neste navegador). */
  saveAppearance: (appearance: Appearance) => void
  /** Mostra uma prévia temporária sem salvar; `null` volta para a aparência salva. */
  previewAppearance: (appearance: Appearance | null) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeTokens {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultTheme
    const parsed = { ...defaultTheme, ...JSON.parse(stored) } as ThemeTokens
    for (const [key, legacy] of Object.entries(legacyDefaults) as [keyof ThemeTokens, string[]][]) {
      if (legacy.includes(String(parsed[key]).toLowerCase())) (parsed[key] as string) = defaultTheme[key] as string
    }
    return parsed
  } catch {
    return defaultTheme
  }
}

/** Lê a aparência salva; na primeira vez, aproveita modo e formato escolhidos na tela antiga. */
export function readStoredAppearance(): Appearance {
  try {
    const parsed = appearanceSchema.safeParse(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null'))
    if (parsed.success) return normalizeAppearance(parsed.data)
    const legacy = readStoredTheme()
    return {
      ...defaultAppearance,
      mode: legacy.mode,
      radius: legacy.radius,
      bodyFont: legacy.font === 'editorial' ? 'lora' : 'inter',
    }
  } catch {
    return defaultAppearance
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeTokens>(readStoredTheme)
  const [appearance, setAppearance] = useState<Appearance>(readStoredAppearance)
  const [preview, setPreview] = useState<Appearance | null>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)) } catch { /* armazenamento indisponível */ }
  }, [theme])

  useLayoutEffect(() => {
    const active = preview ?? appearance
    applyAppearance(active)
    // Cores livres do protótipo só valem quando a aparência está no tema padrão.
    const root = document.documentElement
    if (active.preset === 'padrao' && import.meta.env.VITE_APP_MODE !== 'connected') {
      if (!active.background && theme.surface !== defaultTheme.surface) root.style.setProperty('--bg', theme.surface)
      if (theme.primary.toLowerCase() !== defaultTheme.primary) root.style.setProperty('--brand', theme.primary)
      if (theme.accent.toLowerCase() !== defaultTheme.accent) root.style.setProperty('--accent', theme.accent)
    }
    if (active.mode !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppearance(active)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [appearance, preview, theme.primary, theme.accent, theme.surface])

  const saveAppearance = useCallback((next: Appearance) => {
    setAppearance(next)
    setPreview(null)
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next)) } catch { /* armazenamento indisponível */ }
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    updateTheme: (key, value) => {
      setTheme((current) => ({ ...current, [key]: value }))
      // O protótipo continua trocando modo e formato pela tela antiga.
      if (key === 'mode' || key === 'radius') saveAppearance({ ...appearance, [key]: value } as Appearance)
    },
    resetTheme: () => { setTheme(defaultTheme); saveAppearance(defaultAppearance) },
    appearance,
    saveAppearance,
    previewAppearance: setPreview,
  }), [theme, appearance, saveAppearance])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return context
}
