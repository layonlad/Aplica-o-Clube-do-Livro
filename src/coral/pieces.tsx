import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, NotebookPen, RefreshCw, BookMarked, BookOpen, CheckCircle2, Ellipsis, Heart, Play, Share2, Trash2, UsersRound } from 'lucide-react'
import type { WorkspaceState, ReadingState } from '../../server/src/workspace-model'
import { Sheet } from '../components/Sheet'
import { CoverArt } from '../components/ui'
import { PrivateMedia } from '../community/PrivateMedia'
import { openBook } from '../workspace/BookOpener'
import { ShareSheet } from '../workspace/BookShare'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { BookCover, compact } from './kit'

type Book = WorkspaceState['books'][number]
type Entry = ReadingState[string] | undefined

/** "Capítulo 18 de 29" quando o livro tem capítulos; no EPUB, o capítulo em que a leitura parou. */
export function chapterLabel(book: Book, entry: Entry) {
  if (entry?.epubLocator) return `Capítulo ${entry.epubLocator.chapter + 1}`
  if (book.chapters?.length) {
    const at = entry?.locator ?? 0
    const index = Math.max(0, book.chapters.findIndex((chapter) => at >= chapter.start && at < chapter.end))
    return `Capítulo ${index + 1} de ${book.chapters.length}`
  }
  const status = entry?.status ?? ((entry?.percent ?? 0) >= 100 ? 'finished' : (entry?.percent ?? 0) > 0 ? 'reading' : 'want')
  return { want: 'Quero ler', reading: 'Lendo', finished: 'Concluído', paused: 'Pausado', abandoned: 'Abandonado' }[status]
}

/** Abre o livro com a animação da capa e leva ao leitor na posição salva. */
export function useOpenBook() {
  const navigate = useNavigate()
  return (event: MouseEvent<HTMLElement>, book: Book) =>
    openBook(event, { title: book.title, go: () => navigate(`/app/reader/${book.id}`) })
}

/** Cartão "Continuar lendo" (Início e Biblioteca). */
export function ReadingCard({ book, entry, onMore }: { book: Book; entry: Entry; onMore: () => void }) {
  const open = useOpenBook()
  const navigate = useNavigate()
  const percent = entry?.percent ?? 0
  return (
    <article className="continue-card" aria-label={`Continuar lendo ${book.title}`}>
      <a href={`#/app/reader/${book.id}`} onClick={(event) => { open(event, book); if (!event.defaultPrevented) { event.preventDefault(); navigate(`/app/reader/${book.id}`) } }} aria-label={`Abrir ${book.title}`}>
        <BookCover title={book.title} author={book.author} bookId={book.id} image={book.metadata?.cover} width={84} ratio={0.86} />
      </a>
      <div className="continue-card__body">
        <div className="continue-card__top">
          <div style={{ minWidth: 0 }}>
            <h3 className="continue-card__title">{book.title}</h3>
            <p className="continue-card__author">{book.author}</p>
          </div>
          <button type="button" className="more-button" aria-label={`Opções de ${book.title}`} onClick={onMore}>
            <Ellipsis size={20} />
          </button>
        </div>
        <div className="continue-card__progress">
          <span className="progress-track" role="progressbar" aria-label="Progresso de leitura" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </span>
          <strong>{percent}%</strong>
        </div>
        <div className="continue-card__foot">
          <span className="continue-card__chapter"><BookOpen size={15} aria-hidden="true" />{chapterLabel(book, entry)}</span>
          <a className="pill-button" href={`#/app/reader/${book.id}`} onClick={(event) => { open(event, book); if (!event.defaultPrevented) { event.preventDefault(); navigate(`/app/reader/${book.id}`) } }}>
            {percent > 0 ? 'Continuar' : 'Começar'} <Play size={12} fill="currentColor" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  )
}

/** Menu "•••" de um livro: ações reais da biblioteca pessoal. */
export function BookActions({ book, entry, onClose, extra }: { book: Book; entry: Entry; onClose: () => void; extra?: ReactNode }) {
  const { act, busy, scope } = useWorkspace()
  const navigate = useNavigate()
  const [share, setShare] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const personal = scope === 'personal'
  const finished = (entry?.percent ?? 0) >= 100
  if (share) return <ShareSheet book={{ id: book.id, title: book.title, author: book.author }} onClose={onClose} />
  return (
    <Sheet title={book.title} onClose={onClose} className="action-sheet">
      <div className="action-menu">
        <button type="button" onClick={() => { onClose(); navigate(`/app/reader/${book.id}`) }}>
          <span className="action-menu__icon"><BookOpen size={19} /></span>
          <span>Abrir leitor<small>Continua de onde você parou</small></span>
        </button>
        {personal && ([
          ['export', 'Enviar ao Kindle', FileUp],
          ['progress', 'Atualizar progresso', RefreshCw],
          ['annotations', 'Importar anotações', NotebookPen],
        ] as const).map(([mode, label, Icon]) => (
          <button key={mode} type="button" onClick={() => { onClose(); navigate(`/app/library/integracoes?livro=${book.id}&modo=${mode}`) }}>
            <span className="action-menu__icon"><Icon size={19} aria-hidden="true" /></span><span>{label}</span>
          </button>
        ))}
        {personal && (
          <button type="button" disabled={busy} onClick={() => void act({ type: 'reading.update', id: book.id, ...(finished ? { status: 'reading', percent: 0 } : { status: 'finished' }) }).then((ok) => ok && onClose())}>
            <span className="action-menu__icon"><CheckCircle2 size={19} /></span>
            <span>{finished ? 'Ler de novo' : 'Marcar como concluído'}<small>{finished ? 'Volta para "Lendo"' : 'Vai para "Concluídos"'}</small></span>
          </button>
        )}
        {personal && (
          <button type="button" disabled={busy} onClick={() => void act({ type: 'reading.update', id: book.id, favorite: !entry?.favorite }).then((ok) => ok && onClose())}>
            <span className="action-menu__icon"><Heart size={19} fill={entry?.favorite ? 'currentColor' : 'none'} /></span>
            <span>{entry?.favorite ? 'Tirar dos favoritos' : 'Adicionar aos favoritos'}</span>
          </button>
        )}
        <button type="button" onClick={() => setShare(true)}>
          <span className="action-menu__icon"><Share2 size={19} /></span>
          <span>Compartilhar a capa<small>Só a capa; o arquivo fica com você</small></span>
        </button>
        <button type="button" onClick={() => { onClose(); navigate(`/app/library/gerenciar?livro=${book.id}`) }}>
          <span className="action-menu__icon"><BookMarked size={19} /></span>
          <span>Ver na biblioteca<small>Coleção, status e detalhes</small></span>
        </button>
        {extra}
        {personal && (confirm ? (
          <button type="button" className="is-danger" disabled={busy} onClick={() => void act({ type: 'book.remove', id: book.id }).then((ok) => ok && onClose())}>
            <span className="action-menu__icon"><Trash2 size={19} /></span>
            <span>Confirmar remoção<small>O livro e o progresso saem da biblioteca</small></span>
          </button>
        ) : (
          <button type="button" className="is-danger" onClick={() => setConfirm(true)}>
            <span className="action-menu__icon"><Trash2 size={19} /></span>
            <span>Remover da biblioteca</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** Arte do cartão de clube: a foto de capa do clube ou uma ilustração com a cor do clube e o livro do momento. */
export function ClubArt({ accent, coverMediaId, book, publicMedia = false, name }: { accent: string; coverMediaId?: string | null; book?: { title: string; author: string } | null; publicMedia?: boolean; name: string }) {
  if (coverMediaId)
    return (
      <span className="club-tile__art">
        <PrivateMedia previewOnly publicMedia={publicMedia} media={{ id: coverMediaId, kind: 'image', width: 4, height: 3, duration: null }} alt={`Capa de ${name}`} />
      </span>
    )
  const style = { '--club-art': `linear-gradient(150deg, ${accent} 0%, color-mix(in srgb, ${accent} 55%, #000) 100%)` } as CSSProperties
  return (
    <span className="club-tile__art">
      <span className="club-art" style={style}>
        {book && <span className="club-art__book"><CoverArt title={book.title} author={book.author} /></span>}
      </span>
    </span>
  )
}

/** Cartão de clube com foto e texto sobreposto (Clubes em destaque, Clubes populares). */
export function ClubTile({ name, members, accent, coverMediaId, book, onOpen, tag, publicMedia, width = 126 }: { name: string; members?: number | null; accent: string; coverMediaId?: string | null; book?: { title: string; author: string } | null; onOpen: () => void; tag?: string; publicMedia?: boolean; width?: number }) {
  return (
    <button type="button" className="club-tile" style={{ '--tile-w': `${width}px`, border: 0, textAlign: 'left', cursor: 'pointer' } as CSSProperties} onClick={onOpen} aria-label={`Abrir ${name}`}>
      <ClubArt accent={accent} coverMediaId={coverMediaId} book={book} publicMedia={publicMedia} name={name} />
      {tag && <span className="club-tile__tag">{tag}</span>}
      <UsersRound size={16} aria-hidden="true" />
      <strong>{name}</strong>
      {members != null && <small>{members === 1 ? '1 membro' : `${compact(members)} membros`}</small>}
    </button>
  )
}
