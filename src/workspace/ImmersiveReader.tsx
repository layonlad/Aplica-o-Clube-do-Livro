import { lockPageScroll } from '../components/scroll-lock'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, Maximize, SlidersHorizontal, X } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { readerStyle, type ReaderPreferences } from './ReaderSettings'
import './immersive-reader.css'
type Panel = 'appearance' | 'contents' | 'tools' | null
const panelTabs = [
  ['contents', 'Sumário'],
  ['appearance', 'Aparência'],
  ['tools', 'Marcadores'],
] as const
interface Chrome {
  preview: ReaderPreferences | null
  previewReader: (value: ReaderPreferences | null) => void
  controls: boolean
  setControls: (value: boolean) => void
  panel: Panel
  setPanel: (value: Panel) => void
  /** Onde o conteúdo de cada aba é desenhado: um único painel "Ferramentas de leitura". */
  slot: HTMLElement | null
}
const Context = createContext<Chrome | null>(null)
export const useReaderChrome = () => useContext(Context)
/**
 * Conteúdo de uma aba do painel de ferramentas. No leitor em tela cheia vai para o painel único;
 * fora dele (sem ImmersiveReader), aparece no lugar.
 */
export function ReaderPanel({ name, children }: { name: Exclude<Panel, null>; children: ReactNode }) {
  const chrome = useReaderChrome()
  if (!chrome) return <>{children}</>
  if (chrome.panel !== name || !chrome.slot) return null
  return createPortal(children, chrome.slot)
}
export function ImmersiveReader({
  title,
  preferences,
  children,
  mode,
}: {
  title: string
  preferences: ReaderPreferences
  children: ReactNode
  /** Troca entre o livro original (EPUB) e a versão em texto, quando houver as duas. */
  mode?: { label: string; run: () => void }
}) {
  const [preview, previewReader] = useState<ReaderPreferences | null>(null)
  const [controls, setControls] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [fullscreenError, setFullscreenError] = useState(''),
    [slot, setSlot] = useState<HTMLElement | null>(null)
  const root = useRef<HTMLDivElement>(null),
    acquired = useRef(false)
  useEffect(() => {
    const unlock = lockPageScroll()
    let live = true
    document.documentElement.dataset.readerFocus = 'true'
    const resize = () => {
      root.current?.style.setProperty(
        '--immersive-height',
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      )
    }
    resize()
    window.visualViewport?.addEventListener('resize', resize)
    // Native fullscreen is opportunistic; iOS and browsers without activation use the same viewport layout.
    if (!document.fullscreenElement)
      void document.documentElement
        .requestFullscreen?.()
        .then(() => {
          if (live) acquired.current = true
          else if (document.fullscreenElement === document.documentElement)
            void document.exitFullscreen?.().catch(() => {})
        })
        .catch(() => {})
    return () => {
      live = false
      unlock()
      delete document.documentElement.dataset.readerFocus
      window.visualViewport?.removeEventListener('resize', resize)
      if (acquired.current && document.fullscreenElement === document.documentElement)
        void document.exitFullscreen?.().catch(() => {})
    }
  }, [])
  return (
    <Context.Provider value={{ controls, setControls, panel, setPanel, preview, previewReader, slot }}>
      <div
        ref={root}
        className={`reading-room immersive-reader reading-room--${(preview ?? preferences).theme} reading-room--${(preview ?? preferences).margin}`}
        data-controls={controls ? 'shown' : 'hidden'}
        style={readerStyle(preview ?? preferences)}
      >
        {controls && (
          <header className="immersive-toolbar" aria-label="Controles de leitura">
            <Link className="icon-button" to="/app/library" aria-label="Voltar à biblioteca">
              <ArrowLeft size={20} />
            </Link>
            <span title={title}>{title}</span>
            <button
              className="icon-button"
              aria-label="Ferramentas de leitura"
              aria-haspopup="dialog"
              onClick={() => setPanel('contents')}
            >
              <SlidersHorizontal size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Ocultar controles"
              onClick={() => setControls(false)}
            >
              <X size={20} />
            </button>
          </header>
        )}
        {children}
        {panel && (
          <Sheet title="Ferramentas de leitura" className="reader-sheet" onClose={() => setPanel(null)}>
            <div className="reader-tabs" role="tablist" aria-label="Ferramentas de leitura">
              {panelTabs.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={panel === value}
                  className={panel === value ? 'active' : ''}
                  onClick={() => setPanel(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div ref={setSlot} className="reader-tab-panel" role="tabpanel" />
            {panel === 'appearance' && (
              <div className="reader-mode-actions">
                {mode && (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setPanel(null)
                      mode.run()
                    }}
                  >
                    <BookOpen size={17} aria-hidden="true" /> {mode.label}
                  </button>
                )}
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen?.()
                    else if (document.documentElement.requestFullscreen)
                      void document.documentElement
                        .requestFullscreen()
                        .then(() => {
                          acquired.current = true
                        })
                        .catch(() => setFullscreenError('Leitura ajustada à tela disponível.'))
                    else setFullscreenError('Leitura ajustada à tela disponível.')
                  }}
                >
                  <Maximize size={17} aria-hidden="true" /> Tela cheia do navegador
                </button>
                {fullscreenError && <small role="status">{fullscreenError}</small>}
              </div>
            )}
          </Sheet>
        )}
      </div>
    </Context.Provider>
  )
}
