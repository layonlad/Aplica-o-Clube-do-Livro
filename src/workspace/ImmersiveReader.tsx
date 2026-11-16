import { lockPageScroll } from '../components/scroll-lock'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, List, Maximize, Settings2, Type, X } from 'lucide-react'
import { readerStyle, type ReaderPreferences } from './ReaderSettings'
import './immersive-reader.css'
type Panel = 'appearance' | 'contents' | 'tools' | null
interface Chrome {
  preview: ReaderPreferences | null
  previewReader: (value: ReaderPreferences | null) => void
  controls: boolean
  setControls: (value: boolean) => void
  panel: Panel
  setPanel: (value: Panel) => void
}
const Context = createContext<Chrome | null>(null)
export const useReaderChrome = () => useContext(Context)
export function ImmersiveReader({
  title,
  preferences,
  children,
  onText,
}: {
  title: string
  preferences: ReaderPreferences
  children: ReactNode
  onText: () => void
}) {
  const [preview, previewReader] = useState<ReaderPreferences | null>(null)
  const [controls, setControls] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [fullscreenError, setFullscreenError] = useState('')
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
    <Context.Provider value={{ controls, setControls, panel, setPanel, preview, previewReader }}>
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
              aria-label="Aparência da leitura"
              onClick={() => setPanel('appearance')}
            >
              <Type size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Sumário e pesquisa"
              onClick={() => setPanel('contents')}
            >
              <List size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Ferramentas de leitura"
              onClick={() => setPanel('tools')}
            >
              <Settings2 size={21} />
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
        {controls && (
          <footer className="immersive-footer">
            <button className="text-link" onClick={onText}>
              Versão em texto
            </button>
            <button
              className="icon-button"
              aria-label="Tela cheia do navegador"
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
              <Maximize size={18} />
            </button>
            {fullscreenError && <small role="status">{fullscreenError}</small>}
          </footer>
        )}
      </div>
    </Context.Provider>
  )
}
