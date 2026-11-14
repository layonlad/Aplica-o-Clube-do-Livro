import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button } from '../components/ui'
import { UserAvatar } from '../components/UserAvatar'
import { useTheme } from './ThemeProvider'
import {
  appearanceTokens,
  defaultAppearance,
  fontOptions,
  loadFonts,
  presetOptions,
  type Appearance,
} from './appearance'

const same = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b)

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

/**
 * Aparência e personalização: tema, modo, fontes e formato dos cartões.
 * Cada escolha vira prévia imediata em todo o app; só "Aplicar alterações" salva.
 */
export function AppearanceSettings() {
  const { user } = useAuth()
  const { appearance, saveAppearance, previewAppearance } = useTheme()
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

  async function apply() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (user?.emailVerified)
        await apiRequest(user, '/me/appearance', 'POST', {
          appearance: same(draft, defaultAppearance) ? null : draft,
        })
      saveAppearance(draft)
      setMessage(
        user?.emailVerified
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
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            <Link to="/app/profile">Perfil</Link> · Aparência
          </span>
          <h1>Aparência e personalização</h1>
          <p>
            Escolha cores, fontes e o modo de exibição. Tudo aparece em prévia na hora; nada é salvo
            até você aplicar.
          </p>
        </div>
      </div>

      <div className="appearance-layout">
        <div className="appearance-controls">
          <fieldset className="appearance-group">
            <legend>Tema de cores</legend>
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
                  onChange={() => update({ preset: 'personalizado', accent: draft.accent ?? '#7656a8' })}
                />
                <span
                  className="theme-option__swatch theme-option__swatch--custom"
                  aria-hidden="true"
                  style={custom && draft.accent ? { background: draft.accent } : undefined}
                />
                <span>Personalizado</span>
                <Check className="theme-option__check" size={16} aria-hidden="true" />
              </label>
            </div>
            {custom && (
              <label className="custom-color">
                Sua cor principal
                <input
                  type="color"
                  value={draft.accent ?? '#7656a8'}
                  onChange={(event) => update({ accent: event.target.value.toLowerCase() })}
                />
                <code>{draft.accent}</code>
              </label>
            )}
            {custom && tokens.adjusted && (
              <p className="t-caption appearance-note" role="status">
                Ajustamos o tom para manter textos e botões legíveis (contraste mínimo AA).
              </p>
            )}
          </fieldset>

          <fieldset className="appearance-group">
            <legend>Modo</legend>
            <div className="segmented" role="presentation">
              {(
                [
                  ['light', 'Claro', Sun],
                  ['dark', 'Escuro', Moon],
                  ['system', 'Automático', Monitor],
                ] as const
              ).map(([value, label, Icon]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={draft.mode === value}
                    onChange={() => update({ mode: value })}
                  />
                  <span>
                    <Icon size={16} aria-hidden="true" /> {label}
                  </span>
                </label>
              ))}
            </div>
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
            <legend>Formato dos cartões</legend>
            <div className="segmented" role="presentation">
              {(
                [
                  ['round', 'Arredondado'],
                  ['soft', 'Suave'],
                  ['square', 'Reto'],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="radius"
                    value={value}
                    checked={draft.radius === value}
                    onChange={() => update({ radius: value })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="t-caption">
            O leitor de livros mantém fonte, tamanho e tema próprios, ajustados dentro dele.
          </p>
        </div>

        <aside className="appearance-preview" aria-label="Prévia da aparência">
          <div className="theme-preview-card card card--raised">
            <span className="eyebrow">Prévia</span>
            <h2>Que história vamos viver?</h2>
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
          </div>
          {changed && (
            <p className="appearance-pending" role="status">
              Prévia ativa · alterações ainda não salvas
            </p>
          )}
          <div className="appearance-actions">
            <Button disabled={busy || !changed} onClick={() => void apply()}>
              {busy ? 'Salvando…' : 'Aplicar alterações'}
            </Button>
            <Button variant="secondary" disabled={busy || !changed} onClick={() => setDraft(appearance)}>
              Cancelar
            </Button>
            <Button
              variant="ghost"
              disabled={busy || same(draft, defaultAppearance)}
              onClick={() => update(defaultAppearance)}
            >
              <RotateCcw size={16} aria-hidden="true" /> Restaurar padrão
            </Button>
          </div>
          {message && <p className="toast-status" role="status">{message}</p>}
          {error && <p className="access-error" role="alert">{error}</p>}
        </aside>
      </div>
    </div>
  )
}
