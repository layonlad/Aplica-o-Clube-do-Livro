import { Sheet } from '../components/Sheet'
import { useReaderChrome } from './ImmersiveReader'
import { useEffect, useState, type CSSProperties } from 'react'
import { preferencesSchema, type ReadingPreferences } from '../../server/src/workspace-model'
import { fontOptions, contrast } from '../app/appearance'
import { useWorkspace } from './WorkspaceProvider'
export type ReaderPreferences = ReadingPreferences['reader']
export const readerFont = (font: ReaderPreferences['font']) =>
  ({
    serif: 'var(--font-reading)',
    sans: 'var(--font-ui)',
    lora: "'Lora Variable', Georgia, serif",
    merriweather: "'Merriweather Variable', Georgia, serif",
  })[font]
export function readerStyle(reader: ReaderPreferences): CSSProperties {
  const surface =
    reader.background || { light: '#ffffff', dark: '#1e1d21', sepia: '#f1e5cf' }[reader.theme]
  return {
    '--reader-leading': String(
      { tight: 1.45, normal: 1.75, relaxed: 2 }[reader.lineHeight ?? 'normal'],
    ),
    '--reader-weight': reader.weight === 'bold' ? '600' : '400',
    '--reader-align': reader.align ?? 'left',
    '--reader-surface':
      reader.background || { light: '#ffffff', dark: '#1e1d21', sepia: '#f1e5cf' }[reader.theme],
    '--reader-paragraph': { compact: '.5em', normal: '1em', wide: '1.5em' }[
      reader.paragraphSpacing ?? 'normal'
    ],
    '--reader-ink':
      contrast('#302a23', surface) >= 4.5
        ? '#302a23'
        : contrast('#ffffff', surface) >= 4.5
          ? '#ffffff'
          : '#000000',
  } as CSSProperties
}
export function ReaderSettings() {
  const chrome = useReaderChrome()
  const [error, setError] = useState('')
  const { snapshot, act, busy } = useWorkspace(),
    reader = chrome?.preview ?? preferencesSchema.parse(snapshot!.preferences).reader
  useEffect(() => {
    if (reader.font === 'lora' || reader.font === 'merriweather')
      void fontOptions.find((option) => option.id === reader.font)?.load?.()
  }, [reader.font])
  const update = (patch: Partial<ReaderPreferences>) => {
    const next = { ...reader, ...patch }
    setError('')
    chrome?.previewReader(next)
    void act({ type: 'reader.preferences', reader: next }).then((ok) => {
      chrome?.previewReader(null)
      if (!ok) setError('Não foi possível salvar. Tente novamente.')
    })
  }
  if (chrome && chrome.panel !== 'appearance') return null
  const content = (
    <details open={chrome ? true : undefined} className="reader-settings">
      <summary>Preferências de leitura</summary>
      {error && <p role="alert">{error}</p>}
      <h3>Texto e aparência</h3>
      <div className="reader-settings-grid">
        <label>
          Cor da página
          <input
            aria-label="Cor da página"
            type="color"
            disabled={busy}
            value={
              reader.background ||
              { light: '#ffffff', dark: '#1e1d21', sepia: '#f1e5cf' }[reader.theme]
            }
            onChange={(e) => update({ background: e.target.value })}
          />
        </label>

        <label>
          Espaço entre parágrafos
          <select
            aria-label="Espaço entre parágrafos"
            value={reader.paragraphSpacing ?? 'normal'}
            disabled={busy}
            onChange={(e) =>
              update({ paragraphSpacing: e.target.value as ReaderPreferences['paragraphSpacing'] })
            }
          >
            <option value="compact">Compacto</option>
            <option value="normal">Normal</option>
            <option value="wide">Amplo</option>
          </select>
        </label>

        <label>
          Tamanho da fonte
          <select
            aria-label="Tamanho da fonte"
            value={reader.size}
            disabled={busy}
            onChange={(event) => update({ size: Number(event.target.value) })}
          >
            {[16, 18, 20, 22, 24, 28, 32].map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipografia
          <select
            aria-label="Tipografia"
            value={reader.font}
            disabled={busy}
            onChange={(event) => update({ font: event.target.value as ReaderPreferences['font'] })}
          >
            <option value="serif">Editorial</option>
            <option value="sans">Sem serifa</option>
            <option value="lora">Lora</option>
            <option value="merriweather">Merriweather</option>
          </select>
        </label>
        <label>
          Tema de leitura
          <select
            aria-label="Tema de leitura"
            value={reader.theme}
            disabled={busy}
            onChange={(event) =>
              update({
                theme: event.target.value as ReaderPreferences['theme'],
                background: null,
              })
            }
          >
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
            <option value="sepia">Sépia</option>
          </select>
        </label>
        <label>
          Margens
          <select
            aria-label="Margens"
            value={reader.margin}
            disabled={busy}
            onChange={(event) =>
              update({
                margin: event.target.value as ReaderPreferences['margin'],
              })
            }
          >
            <option value="compact">Compactas</option>
            <option value="comfortable">Confortáveis</option>
            <option value="wide">Ampliação lateral</option>
          </select>
        </label>
        <label>
          Espaçamento das linhas
          <select
            aria-label="Espaçamento das linhas"
            value={reader.lineHeight ?? 'normal'}
            disabled={busy}
            onChange={(event) =>
              update({
                lineHeight: event.target.value as ReaderPreferences['lineHeight'],
              })
            }
          >
            <option value="tight">Justo</option>
            <option value="normal">Padrão</option>
            <option value="relaxed">Amplo</option>
          </select>
        </label>
        <label>
          Espessura do texto
          <select
            aria-label="Espessura do texto"
            value={reader.weight ?? 'regular'}
            disabled={busy}
            onChange={(event) =>
              update({
                weight: event.target.value as ReaderPreferences['weight'],
              })
            }
          >
            <option value="regular">Normal</option>
            <option value="bold">Mais forte</option>
          </select>
        </label>
        <label>
          Alinhamento
          <select
            aria-label="Alinhamento"
            value={reader.align ?? 'left'}
            disabled={busy}
            onChange={(event) =>
              update({
                align: event.target.value as ReaderPreferences['align'],
              })
            }
          >
            <option value="left">À esquerda</option>
            <option value="justify">Justificado</option>
          </select>
        </label>
        <label>
          Navegação no EPUB
          <select
            aria-label="Navegação no EPUB"
            value={reader.flow ?? 'paged'}
            disabled={busy}
            onChange={(event) => update({ flow: event.target.value as ReaderPreferences['flow'] })}
          >
            <option value="paged">Páginas</option>
            <option value="scroll">Rolagem contínua</option>
          </select>
        </label>
      </div>
      <fieldset className="reader-settings-grid">
        <legend>Navegação e gestos</legend>{' '}
        <label className="workspace-check">
          <input
            type="checkbox"
            checked={reader.pageAnimation !== false}
            disabled={busy}
            onChange={(e) => update({ pageAnimation: e.target.checked })}
          />
          Animação de virar página
        </label>
        <label className="workspace-check">
          <input
            type="checkbox"
            checked={reader.edgeTaps !== false}
            disabled={busy}
            onChange={(e) => update({ edgeTaps: e.target.checked })}
          />
          Virar página com toques laterais
        </label>
      </fieldset>
    </details>
  )
  return chrome ? (
    <Sheet
      title="Aparência da leitura"
      className="reader-sheet"
      onClose={() => chrome.setPanel(null)}
    >
      {content}
    </Sheet>
  ) : (
    content
  )
}
