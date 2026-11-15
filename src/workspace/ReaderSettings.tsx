import { useEffect, type CSSProperties } from 'react'
import { preferencesSchema, type ReadingPreferences } from '../../server/src/workspace-model'
import { fontOptions } from '../app/appearance'
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
  return {
    '--reader-leading': String(
      { tight: 1.45, normal: 1.75, relaxed: 2 }[reader.lineHeight ?? 'normal'],
    ),
    '--reader-weight': reader.weight === 'bold' ? '600' : '400',
    '--reader-align': reader.align ?? 'left',
    '--reader-surface': { light: '#ffffff', dark: '#1e1d21', sepia: '#f1e5cf' }[reader.theme],
  } as CSSProperties
}
export function ReaderSettings() {
  const { snapshot, act, busy } = useWorkspace(),
    reader = preferencesSchema.parse(snapshot!.preferences).reader
  useEffect(() => {
    if (reader.font === 'lora' || reader.font === 'merriweather')
      void fontOptions.find((option) => option.id === reader.font)?.load?.()
  }, [reader.font])
  const update = (patch: Partial<ReaderPreferences>) =>
    void act({ type: 'reader.preferences', reader: { ...reader, ...patch } })
  return (
    <details className="reader-settings">
      <summary>Preferências de leitura</summary>
      <div className="reader-settings-grid">
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
      <p className="t-caption">
        Suas escolhas ficam salvas neste navegador e, com conta, acompanham sua leitura em outros
        aparelhos.
      </p>
    </details>
  )
}
