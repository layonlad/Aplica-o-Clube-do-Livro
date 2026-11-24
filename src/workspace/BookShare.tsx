import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe2, Share2, UsersRound, Download, ChevronRight } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Sheet } from '../components/Sheet'
import { useWorkspace } from './WorkspaceProvider'
import { drawnCover } from './book-files'

/**
 * Capa preparada para publicar. Fica só na memória, entre a biblioteca e a tela de destino;
 * nunca leva o arquivo do livro.
 */
export interface PendingBookShare {
  title: string
  author: string
  cover: File
  /** 'public' (comunidade) ou o id do clube. */
  target: string
}
let pending: PendingBookShare | null = null
export function takePendingShare(target: string) {
  if (!pending || pending.target !== target) return null
  const value = pending
  pending = null
  return value
}
export function peekPendingShare(target: string) {
  return pending && pending.target === target ? pending : null
}
export function clearPendingShare() {
  pending = null
}

async function coverFile(book: ShareBook) {
  // Public catalog and personal EPUB images are for reading. Export only the app's illustration.
  const blob = await drawnCover(book.title, book.author)
  if (!blob) return undefined
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `capa.${extension}`, { type: blob.type || 'image/jpeg' })
}

interface ShareBook {
  id: string
  title: string
  author: string
}

/** Botão "Compartilhar" de um livro: a pessoa escolhe para onde vai a capa. */
export function BookShare({ book, compact = false }: { book: ShareBook; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={compact ? 'icon-action' : 'button button--secondary'}
        aria-label={`Compartilhar cartão de ${book.title}`}
        title="Compartilhar"
        onClick={() => setOpen(true)}
      >
        <Share2 size={compact ? 19 : 17} aria-hidden="true" />
        {!compact && 'Compartilhar'}
      </button>
      {open && <ShareSheet book={book} onClose={() => setOpen(false)} />}
    </>
  )
}

export function ShareSheet({ book, onClose }: { book: ShareBook; onClose: () => void }) {
  const { user } = useAuth()
  const { clubs, setScope } = useWorkspace()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true,
      href = ''
    void coverFile(book).then((value) => {
      if (!live || !value) return
      href = URL.createObjectURL(value)
      setFile(value)
      setPreview(href)
    }).catch(() => { if (live) setError('Não foi possível gerar o cartão de leitura.') })
    return () => {
      live = false
      if (href) URL.revokeObjectURL(href)
    }
  }, [book.id, book.title, book.author])
  const canNativeShare =
    !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  function go(target: string) {
    if (!file) return
    pending = { title: book.title, author: book.author, cover: file, target }
    onClose()
    if (target === 'public') navigate('/app/community')
    else {
      setScope(target)
      navigate('/app/wall')
    }
  }
  async function nativeShare() {
    if (!file) return
    try {
      await navigator.share({
        files: [file],
        title: book.title,
        text: `Estou lendo “${book.title}”, de ${book.author}.`,
      })
      onClose()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Não deu para abrir o compartilhamento.')
    }
  }
  function download() {
    if (!preview || !file) return
    const link = document.createElement('a')
    link.href = preview
    link.download = `capa-${book.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.${file.name.split('.').pop()}`
    link.click()
  }
  return (
    <Sheet title="Compartilhar cartão de leitura" onClose={onClose} className="share-sheet">
      <div className="share-sheet__book">
        {preview ? <img src={preview} alt={`Cartão de leitura de ${book.title}`} /> : <span className="share-sheet__placeholder skeleton" />}
        <span>
          <strong>{book.title}</strong>
          <small>{book.author}</small>
        </span>
      </div>
      <div className="share-targets" role="group" aria-label="Onde compartilhar">
        {user?.emailVerified ? (
          <>
            <button type="button" className="share-target" disabled={!file} onClick={() => go('public')}>
              <span className="share-target__icon"><Globe2 size={20} aria-hidden="true" /></span>
              <span><strong>Comunidade</strong><small>Conforme a privacidade do seu perfil</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            {clubs.map((club) => (
              <button type="button" key={club.id} className="share-target" disabled={!file} onClick={() => go(club.id)}>
                <span className="share-target__icon"><UsersRound size={20} aria-hidden="true" /></span>
                <span><strong>{club.name}</strong><small>Mural do clube</small></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </>
        ) : (
          <Link className="share-target" to="/account" onClick={onClose}>
            <span className="share-target__icon"><Globe2 size={20} aria-hidden="true" /></span>
            <span><strong>Comunidade e clubes</strong><small>Entre na sua conta</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        )}
        {canNativeShare ? (
          <button type="button" className="share-target" onClick={() => void nativeShare()}>
            <span className="share-target__icon"><Share2 size={20} aria-hidden="true" /></span>
            <span><strong>Outros apps</strong><small>WhatsApp, Instagram, e-mail…</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="share-target" disabled={!file} onClick={download}>
            <span className="share-target__icon"><Download size={20} aria-hidden="true" /></span>
            <span><strong>Salvar imagem</strong><small>Para postar onde quiser</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="share-sheet__note">O app cria uma ilustração com título e autoria para compartilhar.</p>
      {error && <p role="alert" className="access-error">{error}</p>}
    </Sheet>
  )
}
