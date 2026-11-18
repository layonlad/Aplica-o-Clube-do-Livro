import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Monitor, Moon, Palette, RotateCcw, Sparkles, Sun } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button } from '../components/ui'
import { UserAvatar } from '../components/UserAvatar'
import { useTheme } from './ThemeProvider'
import {
  appearanceTokens,
  backgroundOptions,
  textColorOptions,
  buttonShapeOptions,
  defaultAppearance,
  densityOptions,
  fontOptions,
  lineHeightOptions,
  loadFonts,
  normalizeAppearance,
  presetOptions,
  sameAppearance as same,
  textSizeOptions,
  type Appearance,
} from './appearance'

/** Mantém a aparência da conta igual em todos os aparelhos depois do login. */
export function AppearanceSync() {
  const { user } = useAuth()
  const { appearance, saveAppearance } = useTheme()
  const current = useRef(appearance)
  current.current = appearance
  useEffect(() => {
    if (!user?.emailVerified) return
    let live = true
    apiRequest<{ appearance: Appearance | null }>(user, '/me/appearance')
      .then((value) => {
        if (live && value.appearance && !same(value.appearance, current.current))
          saveAppearance(value.appearance)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, saveAppearance])
  return null
}

/** Grupo de opções em botões segmentados (rádios acessíveis). */
function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="presentation">
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * Aparência e personalização: tema, modo, fontes, texto, espaçamento e formatos.
 * Cada escolha vira prévia imediata em todo o app; só "Aplicar alterações" salva.
 */
export function AppearanceSettings() {
  const { user } = useAuth()
  const { appearance: saved, saveAppearance, previewAppearance } = useTheme()
  const appearance = useMemo(() => normalizeAppearance(saved), [saved])
  const [draft, setDraft] = useState<Appearance>(appearance)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const changed = !same(draft, appearance)
  const tokens = useMemo(() => appearanceTokens(draft), [draft])

  // Amostras das fontes: carregadas só nesta tela, nunca no início do app.
  useEffect(() => {
    for (const font of fontOptions) void font.load?.()
  }, [])
  useEffect(() => {
    loadFonts(draft)
    previewAppearance(changed ? draft : null)
  }, [draft, changed, previewAppearance])
  // Sair da tela sem aplicar descarta a prévia.
  useEffect(() => () => previewAppearance(null), [previewAppearance])

  function update(patch: Partial<Appearance>) {
    setMessage('')
    setError('')
    setDraft((value) => ({ ...value, ...patch }))
  }

  async function apply(value: Appearance = draft) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (user?.emailVerified)
        await apiRequest(user, '/me/appearance', 'POST', {
          appearance: same(value, defaultAppearance) ? null : value,
        })
      saveAppearance(value)
      setDraft(value)
      setMessage(
        same(value, defaultAppearance)
          ? 'Aparência original restaurada.'
          : user?.emailVerified
          ? 'Aparência aplicada e salva na sua conta.'
          : 'Aparência aplicada neste navegador. Entre na sua conta para levá-la a outros aparelhos.',
      )
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const custom = draft.preset === 'personalizado'
  const headings = fontOptions
  return (
    <div className="appearance-page stack-lg">
      <p className="t-subtitle">Tudo aparece em prévia na hora. Toque em “Aplicar” para salvar na sua conta.</p>

      <div className="appearance-layout">
        <div className="appearance-controls">
          <fieldset className="appearance-group">
            <legend>Tema</legend>
            <div className="seg-control" role="group" aria-label="Tema">
              {(
                [
                  ['original', 'Original', Sparkles],
                  ['light', 'Claro', Sun],
                  ['dark', 'Escuro', Moon],
                  ['system', 'Sistema', Monitor],
                ] as const
              ).map(([value, label, Icon]) => {
                const original = draft.preset === 'padrao' && draft.mode === 'light' && !draft.background && !draft.textColor
                const pressed = value === 'original' ? original : !original && draft.mode === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() =>
                      value === 'original'
                        ? update({ preset: 'padrao', accent: null, mode: 'light', background: null, textColor: null })
                        : update({ mode: value })
                    }
                  >
                    <Icon size={15} aria-hidden="true" /> {label}
                  </button>
                )
              })}
            </div>
            <p className="t-caption appearance-note">“Original” é o visual coral padrão do aplicativo. “Sistema” acompanha o modo claro ou escuro do aparelho.</p>
          </fieldset>

          <fieldset className="appearance-group">
            <legend>Fundo do aplicativo</legend>
            <div className="swatch-row">
              {backgroundOptions.map((option) => (
                <button key={option.id} type="button" className="swatch" aria-pressed={(draft.background ?? null) === option.color} onClick={() => update({ background: option.color })}>
                  <span className="swatch__chip" style={{ background: option.color ?? (tokens.dark ? '#121215' : '#ffffff') }} />
                  {option.label}
                </button>
              ))}
              <label className="swatch">
                <span className="swatch__chip swatch__chip--custom" style={draft.background && !backgroundOptions.some((option) => option.color === draft.background) ? { background: draft.background } : undefined}>
                  <input type="color" aria-label="Cor de fundo personalizada" value={draft.background ?? '#ffffff'} onChange={(event) => update({ background: event.target.value.toLowerCase() })} />
                </span>
                Personalizada
              </label>
            </div>
          </fieldset>

          <fieldset className="appearance-group">
            <legend>Cor dos textos</legend>
            <div className="swatch-row">
              {textColorOptions.map((option) => (
                <button key={option.id} type="button" className="swatch" aria-pressed={(draft.textColor ?? null) === option.color} onClick={() => update({ textColor: option.color })}>
                  <span className="swatch__chip swatch__chip--text" style={{ color: option.color ?? undefined }}>Aa</span>
                  {option.label}
                </button>
              ))}
              <label className="swatch">
                <span className="swatch__chip swatch__chip--custom" style={draft.textColor && !textColorOptions.some((option) => option.color === draft.textColor) ? { background: draft.textColor } : undefined}>
                  <input type="color" aria-label="Cor do texto personalizada" value={draft.textColor ?? '#18181c'} onChange={(event) => update({ textColor: event.target.value.toLowerCase() })} />
                </span>
                Personalizada
              </label>
            </div>
            <p className="t-caption appearance-note">Se a cor escolhida ficar difícil de ler no fundo, o app ajusta o tom para manter o contraste mínimo de leitura.</p>
          </fieldset>

          <fieldset className="appearance-group">
            <legend>Cor de destaque</legend>
            <div className="theme-options">
              {presetOptions.map((preset) => (
                <label className="theme-option" key={preset.id}>
                  <input
                    type="radio"
                    name="preset"
                    value={preset.id}
                    checked={draft.preset === preset.id}
                    onChange={() => update({ preset: preset.id, accent: null })}
                  />
                  <span className="theme-option__swatch" aria-hidden="true">
                    <i style={{ background: preset.brand }} />
                    <i style={{ background: preset.accent }} />
                  </span>
                  <span>{preset.label}</span>
                  <Check className="theme-option__check" size={16} aria-hidden="true" />
                </label>
              ))}
              <label className="theme-option">
                <input
                  type="radio"
                  name="preset"
                  value="personalizado"
                  checked={custom}
                  onChange={() => update({ preset: 'personalizado', accent: draft.accent ?? '#d44425' })}
                />
                <span className="theme-option__swatch theme-option__swatch--custom" aria-hidden="true" style={custom && draft.accent ? { background: draft.accent } : undefined} />
                <span>Personalizada</span>
                <Check className="theme-option__check" size={16} aria-hidden="true" />
              </label>
            </div>
            {custom && (
              <label className="custom-color">
                <Palette size={16} aria-hidden="true" /> Sua cor
                <input type="color" value={draft.accent ?? '#d44425'} onChange={(event) => update({ accent: event.target.value.toLowerCase() })} />
                <code>{draft.accent}</code>
              </label>
            )}
            {custom && tokens.adjusted && (
              <p className="t-caption appearance-note" role="status">
                Ajustamos o tom para manter textos e botões legíveis (contraste mínimo AA).
              </p>
            )}
          </fieldset>

          {(
            [
              ['headingFont', 'Fonte dos títulos', 'Que história vamos viver?'],
              ['bodyFont', 'Fonte dos textos e da interface', 'Leituras que aproximam pessoas.'],
            ] as const
          ).map(([key, label, sample]) => (
            <fieldset className="appearance-group" key={key}>
              <legend>{label}</legend>
              <div className="font-options">
                {headings.map((font) => (
                  <label className="font-option" key={font.id}>
                    <input
                      type="radio"
                      name={key}
                      value={font.id}
                      checked={draft[key] === font.id}
                      onChange={() => update({ [key]: font.id } as Partial<Appearance>)}
                    />
                    <span className="font-option__sample" style={{ fontFamily: font.family }}>
                      {sample}
                    </span>
                    <small>
                      {font.label} · {font.kind}
                    </small>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset className="appearance-group">
            <legend>Texto e espaçamento</legend>
            <div className="format-rows">
              <div className="format-row">
                <span className="format-row__label" id="format-size">
                  Tamanho do texto
                  <small>Vale para o app inteiro: títulos, botões e campos acompanham.</small>
                </span>
                <Segmented
                  name="textSize"
                  value={draft.textSize ?? 'md'}
                  options={textSizeOptions}
                  onChange={(textSize) => update({ textSize })}
                />
              </div>
              <div className="format-row">
                <span className="format-row__label">
                  Espaçamento
                  <small>Compacto mostra mais conteúdo por tela, bom para o celular.</small>
                </span>
                <Segmented
                  name="density"
                  value={draft.density ?? 'regular'}
                  options={densityOptions}
                  onChange={(density) => update({ density })}
                />
              </div>
              <div className="format-row">
                <span className="format-row__label">
                  Entrelinha
                  <small>Distância entre as linhas de publicações e descrições.</small>
                </span>
                <Segmented
                  name="lineHeight"
                  value={draft.lineHeight ?? 'normal'}
                  options={lineHeightOptions}
                  onChange={(lineHeight) => update({ lineHeight })}
                />
              </div>
            </div>
            <p className="format-sample" aria-hidden="true">
              <strong>Amostra:</strong> Terminei o capítulo 12 ontem à noite e ainda estou pensando
              naquele final. Alguém mais achou que a narradora sabia de tudo desde o começo?
            </p>
          </fieldset>

          <fieldset className="appearance-group">
            <legend>Formatos</legend>
            <div className="format-rows">
              <div className="format-row">
                <span className="format-row__label">Cartões</span>
                <Segmented
                  name="radius"
                  value={draft.radius}
                  options={[
                    { id: 'round', label: 'Arredondado' },
                    { id: 'soft', label: 'Suave' },
                    { id: 'square', label: 'Reto' },
                  ] as const}
                  onChange={(radius) => update({ radius })}
                />
              </div>
              <div className="format-row">
                <span className="format-row__label">Botões e campos</span>
                <Segmented
                  name="buttons"
                  value={draft.buttons ?? 'pill'}
                  options={buttonShapeOptions}
                  onChange={(buttons) => update({ buttons })}
                />
              </div>
            </div>
          </fieldset>
          <p className="t-caption">
            O leitor de livros mantém fonte, tamanho e tema próprios, ajustados dentro dele.
          </p>
        </div>

        <aside className="appearance-preview" aria-label="Prévia da aparência">
          <div className="theme-preview-card card card--raised">
            <span className="eyebrow">Prévia</span>
            <h2>Continuar lendo</h2>
            <p>Um cartão de leitura como os do seu mural, com o seu tema aplicado.</p>
            <div className="theme-preview-card__identity">
              <UserAvatar name={user?.displayName || 'Leitora'} size="md" />
              <span>
                <strong>{user?.displayName || 'Leitora'}</strong>
                <small>Resenha · agora</small>
              </span>
            </div>
            <div className="progress-block">
              <div className="progress-label">
                <span>Seu progresso</span>
                <strong>62%</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: '62%' }} />
              </div>
            </div>
            <div className="workspace-actions">
              <span className="button button--primary" aria-hidden="true">
                Continuar leitura
              </span>
              <span className="chip chip--accent">Romance</span>
            </div>
            <span className="input theme-preview-card__field" aria-hidden="true">
              Escreva um comentário…
            </span>
          </div>
          {changed && (
            <p className="appearance-pending" role="status">
              Prévia ativa · alterações ainda não salvas
            </p>
          )}
          <div className="appearance-actions">
            <Button disabled={busy || !changed} aria-busy={busy} onClick={() => void apply()}>
              {busy ? 'Salvando…' : 'Aplicar'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !changed}
              onClick={() => setDraft(appearance)}
            >
              Cancelar
            </Button>
            <Button
              variant="ghost"
              disabled={busy || (same(draft, defaultAppearance) && same(appearance, defaultAppearance))}
              onClick={() => void apply(defaultAppearance)}
            >
              <RotateCcw size={16} aria-hidden="true" /> Restaurar aparência original
            </Button>
          </div>
          {message && (
            <p className="toast-status" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
