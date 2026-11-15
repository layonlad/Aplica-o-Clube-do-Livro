import type { Appearance } from '../../server/src/appearance-schema'

export type { Appearance }
export type FontId = Appearance['headingFont']
export type PresetId = Appearance['preset']

/**
 * Fontes oferecidas na personalização (todas SIL Open Font License, auto-hospedadas).
 * Fraunces e Plus Jakarta Sans já vêm no pacote principal; as demais são baixadas só quando escolhidas.
 */
export const fontOptions: {
  id: FontId
  label: string
  kind: 'editorial' | 'moderna'
  family: string
  load?: () => Promise<unknown>
}[] = [
  {
    id: 'fraunces',
    label: 'Fraunces',
    kind: 'editorial',
    family: "'Fraunces Variable', Georgia, serif",
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    kind: 'editorial',
    family: "'Playfair Display Variable', Georgia, serif",
    load: () => import('@fontsource-variable/playfair-display/index.css'),
  },
  {
    id: 'lora',
    label: 'Lora',
    kind: 'editorial',
    family: "'Lora Variable', Georgia, serif",
    load: () => import('@fontsource-variable/lora/index.css'),
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    kind: 'editorial',
    family: "'Merriweather Variable', Georgia, serif",
    load: () => import('@fontsource-variable/merriweather/index.css'),
  },
  {
    id: 'jakarta',
    label: 'Plus Jakarta Sans',
    kind: 'moderna',
    family: "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    kind: 'moderna',
    family: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
    load: () => import('@fontsource-variable/inter/index.css'),
  },
  {
    id: 'manrope',
    label: 'Manrope',
    kind: 'moderna',
    family: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif",
    load: () => import('@fontsource-variable/manrope/index.css'),
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    kind: 'moderna',
    family: "'DM Sans Variable', ui-sans-serif, system-ui, sans-serif",
    load: () => import('@fontsource-variable/dm-sans/index.css'),
  },
  {
    id: 'poppins',
    label: 'Poppins',
    kind: 'moderna',
    family: "'Poppins', ui-sans-serif, system-ui, sans-serif",
    load: () =>
      Promise.all([
        import('@fontsource/poppins/400.css'),
        import('@fontsource/poppins/600.css'),
        import('@fontsource/poppins/700.css'),
      ]),
  },
]

/** Temas prontos: cor de marca (botões, links) e acento (destaques). Todos passam em AA com texto branco. */
export const presetOptions: { id: PresetId; label: string; brand: string; accent: string }[] = [
  { id: 'padrao', label: 'Padrão', brand: '#462b70', accent: '#fc7667' },
  { id: 'roxo', label: 'Roxo', brand: '#5a3b8c', accent: '#b9a6d9' },
  { id: 'coral', label: 'Coral', brand: '#a8362a', accent: '#fc7667' },
  { id: 'azul', label: 'Azul', brand: '#2546a8', accent: '#9db6ff' },
  { id: 'verde', label: 'Verde', brand: '#1f5c3f', accent: '#b9e6c9' },
  { id: 'dourado', label: 'Dourado', brand: '#7d5300', accent: '#f4b942' },
]

export const defaultAppearance: Appearance = {
  preset: 'padrao',
  mode: 'light',
  accent: null,
  headingFont: 'fraunces',
  bodyFont: 'jakarta',
  radius: 'round',
}

// ── Contraste (WCAG 2.2) ──
function channel(value: number) {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
function rgb(hex: string) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ]
}
function hex([r, g, b]: [number, number, number]) {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
export function luminance(color: string) {
  const [r, g, b] = rgb(color)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
/** Mistura uma cor com branco (amount > 0) ou preto (amount < 0). */
function mix(color: string, amount: number) {
  const target = amount > 0 ? 255 : 0
  const weight = Math.abs(amount)
  return hex(rgb(color).map((v) => v + (target - v) * weight) as [number, number, number])
}
/**
 * Ajusta uma cor de marca até ela ter contraste AA (≥ 4,5) com o fundo dado,
 * escurecendo (fundo claro) ou clareando (fundo escuro). Devolve a cor original quando já é legível.
 */
export function ensureContrast(color: string, background: string, minimum = 4.5) {
  if (contrast(color, background) >= minimum) return { color, adjusted: false }
  const lighten = contrast('#ffffff', background) >= contrast('#000000', background)
  for (let step = 0.05; step <= 1; step += 0.05) {
    const candidate = mix(color, lighten ? step : -step)
    if (contrast(candidate, background) >= minimum) return { color: candidate, adjusted: true }
  }
  return { color: lighten ? '#ffffff' : '#000000', adjusted: true }
}

const LIGHT_BG = '#fbf4e8'
const DARK_BG = '#17111f'

export function resolvedMode(appearance: Appearance) {
  if (appearance.mode !== 'system') return appearance.mode
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Converte a escolha do usuário em tokens semânticos. A marca sempre fica legível como texto sobre o fundo
 * e como fundo de botão com texto branco (claro) ou escuro (modo escuro).
 */
export function appearanceTokens(appearance: Appearance) {
  const preset = presetOptions.find((item) => item.id === appearance.preset) ?? presetOptions[0]
  const base =
    appearance.preset === 'personalizado' && appearance.accent ? appearance.accent : preset.brand
  const dark = resolvedMode(appearance) === 'dark'
  const background = appearance.background ?? (dark ? DARK_BG : LIGHT_BG)
  const customBackground = !!appearance.background
  const darkSurface = contrast('#ffffff', background) >= contrast('#000000', background)
  const surface = mix(background, darkSurface ? -0.1 : 0.65)
  const isDefault = appearance.preset === 'padrao' && !customBackground
  const onLight = ensureContrast(base, '#ffffff')
  const brand = darkSurface
    ? ensureContrast(mix(base, 0.45), background, 7).color
    : ensureContrast(onLight.color, background).color
  const heading = fontOptions.find((font) => font.id === appearance.headingFont) ?? fontOptions[0]
  const body = fontOptions.find((font) => font.id === appearance.bodyFont) ?? fontOptions[4]
  return {
    dark,
    adjusted: onLight.adjusted,
    vars: {
      '--bg': customBackground ? background : null,
      '--bg-sunken': customBackground ? mix(background, darkSurface ? -0.16 : 0.05) : null,
      '--surface': customBackground ? surface : null,
      '--surface-raised': customBackground ? mix(background, darkSurface ? -0.04 : 0.85) : null,
      '--text': customBackground
        ? ensureContrast(darkSurface ? '#f6efe4' : '#22192e', background, 7).color
        : null,
      '--text-muted': customBackground
        ? ensureContrast(darkSurface ? '#c4b8cc' : '#5f5569', background).color
        : null,
      '--text-subtle': customBackground
        ? ensureContrast(darkSurface ? '#c4b8cc' : '#5f5569', background).color
        : null,
      '--danger': customBackground ? ensureContrast(darkSurface?'#ff9a8f':'#a8302e',background).color : null,
      '--success': customBackground ? ensureContrast(darkSurface?'#b9e6c9':'#2b7552',background).color : null,
      '--warning': customBackground ? ensureContrast(darkSurface?'#f4b942':'#7d5300',background).color : null,
      '--info': customBackground ? ensureContrast(darkSurface?'#9db6ff':'#2546a8',background).color : null,
      '--danger-soft':customBackground?'color-mix(in srgb, var(--danger) 12%, var(--surface))':null,
      '--success-soft':customBackground?'color-mix(in srgb, var(--success) 12%, var(--surface))':null,
      '--warning-soft':customBackground?'color-mix(in srgb, var(--warning) 12%, var(--surface))':null,
      '--info-soft':customBackground?'color-mix(in srgb, var(--info) 12%, var(--surface))':null,
      '--border-strong':customBackground?ensureContrast(darkSurface?'#c4b8cc':'#5f5569',background,3).color:null,
      '--border': customBackground
        ? `color-mix(in srgb, ${darkSurface ? '#ffffff' : '#000000'} 18%, transparent)`
        : null,
      '--divider': customBackground
        ? `color-mix(in srgb, ${darkSurface ? '#ffffff' : '#000000'} 12%, transparent)`
        : null,
      '--text-on-brand': customBackground
        ? contrast('#ffffff', brand) >= 4.5
          ? '#ffffff'
          : '#000000'
        : null,
      '--brand': isDefault ? null : brand,
      '--brand-hover': isDefault ? null : dark ? mix(brand, 0.2) : mix(brand, -0.18),
      '--brand-ink': isDefault ? null : brand,
      '--brand-soft': isDefault
        ? null
        : `color-mix(in srgb, ${brand} ${dark ? 18 : 11}%, var(--surface))`,
      '--accent': isDefault
        ? null
        : preset.accent && appearance.preset !== 'personalizado'
          ? preset.accent
          : mix(base, 0.35),
      '--font-display': appearance.headingFont === 'fraunces' ? null : heading.family,
      '--font-ui': appearance.bodyFont === 'jakarta' ? null : body.family,
      '--radius-card':
        appearance.radius === 'round'
          ? null
          : appearance.radius === 'soft'
            ? 'var(--radius-md)'
            : 'var(--radius-xs)',
    } as Record<string, string | null>,
  }
}

export function loadFonts(appearance: Appearance) {
  for (const id of new Set([appearance.headingFont, appearance.bodyFont]))
    void fontOptions.find((font) => font.id === id)?.load?.()
}

/** Aplica os tokens no <html>. Usado pelo provedor de tema e pela prévia. */
export function applyAppearance(
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
) {
  const { dark, vars } = appearanceTokens(appearance)
  loadFonts(appearance)
  root.dataset.theme = dark ? 'dark' : 'light'
  for (const [name, value] of Object.entries(vars))
    if (value) root.style.setProperty(name, value)
    else root.style.removeProperty(name)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', appearance.background ?? (dark ? DARK_BG : LIGHT_BG))
}

export const APPEARANCE_KEY = 'clube-livro-appearance'
