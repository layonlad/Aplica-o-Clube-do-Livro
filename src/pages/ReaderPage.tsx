import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, List, Minus, Moon, Plus, SunMedium, Type } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { currentBook } from '../data/mockData'

export function ReaderPage() {
  const navigate = useNavigate()
  const [fontSize, setFontSize] = useState(19)
  const [night, setNight] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)

  return (
    <div className={`reader-page ${night ? 'reader-page--night' : ''}`}>
      <header className="reader-header">
        <button className="icon-button" aria-label="Voltar à biblioteca" onClick={() => navigate('/app/library')}><ArrowLeft /></button>
        <div><small>{currentBook.title}</small><strong>Capítulo 8 de 24</strong></div>
        <button className={`icon-button ${bookmarked ? 'active' : ''}`} aria-label="Marcar página" onClick={() => setBookmarked((value) => !value)}><Bookmark fill={bookmarked ? 'currentColor' : 'none'} /></button>
      </header>
      <div className="reader-progress"><span style={{ width: '62%' }} /></div>
      <article className="reader-text" style={{ fontSize }}>
        <span className="eyebrow">CAPÍTULO 8</span>
        <h1>Terra de dentro</h1>
        <p className="dropcap">Naquele tempo, a terra guardava mais histórias do que os homens conseguiam contar. Cada caminho aberto entre as árvores parecia levar de volta a uma lembrança, e o silêncio da manhã tinha o peso de uma promessa.</p>
        <p>Seguimos devagar, reconhecendo pelo cheiro da chuva o que o céu ainda não dizia. Era assim que aprendíamos: observando o mundo antes de lhe dar nome.</p>
        <blockquote>“O que não cabia na palavra encontrava morada no gesto.”</blockquote>
        <p>Quando a tarde chegou, dourada sobre as folhas, entendi que algumas histórias não terminam. Apenas mudam de voz para continuar sendo contadas.</p>
        <div className="demo-text-note">Trecho fictício criado apenas para demonstrar a experiência do leitor.</div>
      </article>
      <div className="reader-turn"><button aria-label="Página anterior"><ChevronLeft /></button><span>164 de 264</span><button aria-label="Próxima página"><ChevronRight /></button></div>
      <footer className="reader-toolbar">
        <button aria-label="Sumário"><List /><span>Sumário</span></button>
        <div className="font-controls"><Type /><button aria-label="Diminuir texto" onClick={() => setFontSize((size) => Math.max(16, size - 1))}><Minus /></button><button aria-label="Aumentar texto" onClick={() => setFontSize((size) => Math.min(26, size + 1))}><Plus /></button></div>
        <button aria-label="Alternar modo de leitura" onClick={() => setNight((value) => !value)}>{night ? <SunMedium /> : <Moon />}<span>{night ? 'Claro' : 'Noturno'}</span></button>
      </footer>
    </div>
  )
}
