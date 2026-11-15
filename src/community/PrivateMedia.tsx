import { mediaBase } from './social-api'
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { uploadPhoto } from './photo-upload'
import { Play, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, ApiError, messageFor, readableError } from '../auth/api'
import type { PostMedia, Page } from '../../server/src/community-contracts'
import { Button } from '../components/ui'
export async function uploadMediaFile(
  user: NonNullable<ReturnType<typeof useAuth>['user']>,
  clubId: string | null,
  file: File,
  options?: { id: string; signal: AbortSignal; onProgress: (value: number) => void },
): Promise<PostMedia> {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return uploadPhoto(
      user,
      clubId,
      file,
      options ?? {
        id: crypto.randomUUID(),
        signal: new AbortController().signal,
        onProgress: () => {},
      },
    )
  const kind = file.type.startsWith('video/') ? 'video' : 'image'
  const limit = kind === 'video' ? 10000000 : file.type === 'image/gif' ? 8000000 : 5000000
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'].includes(file.type) ||
    file.size > limit
  )
    throw Error('Este formato ou tamanho de arquivo não é compatível com o envio.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384))
  return apiRequest<PostMedia>(user, mediaBase(clubId), 'POST', { kind, data: btoa(binary) })
}
export function MediaPicker({
  clubId,
  value,
  onChange,
  onBusy,
  imagesOnly = false,
  compact = false,
}: {
  clubId: string | null
  imagesOnly?: boolean
  compact?: boolean
  value: PostMedia[]
  onChange: (value: PostMedia[]) => void
  onBusy?: (busy: boolean) => void
}) {
  const { user } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [recover, setRecover] = useState(false),
    [pendingTicket, setPendingTicket] = useState<string | null>(null),
    [progress, setProgress] = useState(0),
    [retryFiles, setRetryFiles] = useState<File[]>([]),
    [drafts, setDrafts] = useState<Page<PostMedia>>({ items: [], nextCursor: null })
  const abort = useRef<AbortController | null>(null),
    tickets = useRef(new WeakMap<File, string>()),
    activeTicket = useRef<string | null>(null),
    selectedRef = useRef(value)
  selectedRef.current = value
  useEffect(
    () => () => {
      abort.current?.abort()
      const id = activeTicket.current
      if (id && user) void apiRequest(user, `/photo-uploads/${id}`, 'DELETE').catch(() => {})
    },
    [user?.uid],
  )
  useEffect(() => {
    if (!recover || !user?.emailVerified) return
    let live = true
    apiRequest<Page<PostMedia>>(user, `${mediaBase(clubId)}/drafts`)
      .then((value) => live && setDrafts(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, clubId, recover, value.length])
  async function moreDrafts() {
    if (!drafts.nextCursor || !user) return
    setBusy(true)
    try {
      const next = await apiRequest<Page<PostMedia>>(
        user,
        `${mediaBase(clubId)}/drafts?cursor=${encodeURIComponent(drafts.nextCursor)}`,
      )
      setDrafts((value) => ({
        items: [...value.items, ...next.items],
        nextCursor: next.nextCursor,
      }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  async function files(files: File[]) {
    if (!user) return
    setBusy(true)
    onBusy?.(true)
    setError('')
    const controller = new AbortController()
    abort.current = controller
    setProgress(0)
    const selected = [...selectedRef.current]
    try {
      if (imagesOnly && files.some((file) => file.type.startsWith('video/')))
        throw Error('Anexe somente fotos nesta discussão.')
      if (files.length + value.length > 4) throw Error('Adicione até quatro arquivos de cada vez.')
      for (const [index, file] of files.entries()) {
        if (!tickets.current.has(file)) tickets.current.set(file, crypto.randomUUID())
        activeTicket.current = tickets.current.get(file)!
        const item = await uploadMediaFile(user, clubId, file, {
          id: tickets.current.get(file)!,
          signal: controller.signal,
          onProgress: (value) =>
            setProgress(Math.round(((index + value / 100) / files.length) * 100)),
        })
        if (controller.signal.aborted) {
          await apiRequest(user, `/media/${item.id}`, 'DELETE').catch(() => {})
          throw new DOMException('Cancelado', 'AbortError')
        }
        if (!selected.some((media) => media.id === item.id)) selected.push(item)
        selectedRef.current = [...selected]
        onChange([...selected])
      }
      setRetryFiles([])
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setError(messageFor(err))
        setRetryFiles(files)
        if (err instanceof ApiError && err.code === 'PHOTO_UPLOAD_IN_PROGRESS') {
          const pending = await apiRequest<{ items: { id: string }[] }>(
            user,
            '/photo-uploads',
          ).catch(() => ({ items: [] }))
          setPendingTicket(pending.items[0]?.id ?? null)
        }
      }
    } finally {
      setBusy(false)
      activeTicket.current = null
      onBusy?.(false)
    }
  }
  async function remove(id: string) {
    if (!user) return
    setBusy(true)
    onBusy?.(true)
    setError('')
    try {
      await apiRequest(user, `/media/${id}`, 'DELETE')
      onChange(value.filter((item) => item.id !== id))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
      onBusy?.(false)
    }
  }
  return (
    <div className={`media-picker ${compact ? 'media-picker--compact' : ''}`}>
      <label className="file-button">
        {imagesOnly ? 'Adicionar fotos' : 'Adicionar fotos ou vídeo'}
        <input
          type="file"
          accept={
            imagesOnly
              ? 'image/jpeg,image/png,image/webp,image/gif'
              : 'image/jpeg,image/png,image/webp,image/gif,video/mp4'
          }
          multiple
          disabled={busy || value.length >= 4}
          onChange={(event) => {
            if (event.target.files) void files(Array.from(event.target.files))
            event.target.value = ''
          }}
        />
      </label>
      {busy && (
        <div className="upload-progress" role="status">
          <progress max={100} value={progress} aria-label="Progresso do envio" />
          <span>{progress < 97 ? `Enviando foto · ${progress}%` : 'Preparando a foto…'}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              abort.current?.abort()
              const id = activeTicket.current
              if (id) void apiRequest(user!, `/photo-uploads/${id}`, 'DELETE').catch(() => {})
            }}
          >
            Cancelar envio
          </Button>
        </div>
      )}
      {!busy && pendingTicket && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void apiRequest(user!, `/photo-uploads/${pendingTicket}`, 'DELETE').then(() => {
              setPendingTicket(null)
              setError('')
              setRetryFiles([])
            })
          }}
        >
          Cancelar envio em aberto
        </Button>
      )}
      {!busy && !pendingTicket && retryFiles.length > 0 && (
        <Button type="button" variant="secondary" onClick={() => void files(retryFiles)}>
          Tentar envio novamente
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="post-media-grid">
        {value.map((item) => (
          <div key={item.id}>
            <PrivateMedia media={item} alt="Arquivo preparado para a publicação" />
            <Button
              disabled={busy}
              variant="ghost"
              type="button"
              onClick={() => void remove(item.id)}
            >
              Retirar arquivo
            </Button>
          </div>
        ))}
      </div>
      <details onToggle={(event) => setRecover(event.currentTarget.open)}>
        <summary>Rascunhos de fotos</summary>
        <p>Selecione uma foto de um envio anterior.</p>
        <div className="post-media-grid">
          {drafts.items
            .filter(
              (item) =>
                (!imagesOnly || item.kind === 'image') &&
                !value.some((selected) => selected.id === item.id),
            )
            .map((item) => (
              <div key={item.id}>
                <PrivateMedia media={item} alt="Arquivo ainda não publicado" />
                <Button
                  variant="secondary"
                  type="button"
                  disabled={busy || value.length >= 4}
                  onClick={() => onChange([...value, item])}
                >
                  Usar este arquivo
                </Button>
              </div>
            ))}
        </div>
        {!drafts.items.length && <p>Nenhum arquivo preparado para recuperar.</p>}
        {drafts.nextCursor && (
          <Button variant="ghost" type="button" disabled={busy} onClick={() => void moreDrafts()}>
            Mais arquivos preparados
          </Button>
        )}
      </details>
    </div>
  )
}
function useMediaUrl(
  id: string,
  variant: 'thumbnail' | 'feed' | 'full',
  enabled: boolean,
  publicMedia = false,
) {
  const { user } = useAuth(),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    setUrl('')
    setError('')
    if (!enabled || (!publicMedia && !user?.emailVerified)) return
    const abort = new AbortController()
    let objectUrl = ''
    void (async () => {
      try {
        const token = user?.emailVerified ? await user.getIdToken() : null
        if (abort.signal.aborted) return
        const response = await fetch(
          `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1/${publicMedia ? 'public/' : ''}media/${id}/content?variant=${variant}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(75000)]),
          },
        )
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new ApiError(
            response.status,
            payload?.error?.code ?? 'MEDIA_UNAVAILABLE',
            payload?.error?.message ?? 'Registro indisponível.',
          )
        }
        const blob = await response.blob()
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch (err) {
        if (!abort.signal.aborted) setError(readableError(err))
      }
    })()
    return () => {
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [user?.uid, user?.emailVerified, id, variant, enabled, retry, publicMedia])
  return { url, error, retry: () => setRetry((value) => value + 1) }
}
export function PrivateMedia({
  media,
  alt,
  full = false,
  publicMedia = false,
  previewOnly = false,
  feed = false,
}: {
  media: PostMedia
  alt: string
  full?: boolean
  publicMedia?: boolean
  previewOnly?: boolean
  feed?: boolean
}) {
  const [visible, setVisible] = useState(full),
    [expanded, setExpanded] = useState(false),
    ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (full) {
      setVisible(true)
      return
    }
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [full])
  const thumbnail = useMediaUrl(media.id, 'thumbnail', visible && !full, publicMedia)
  const detailed = useMediaUrl(
    media.id,
    full ? 'full' : 'feed',
    visible && (full || (feed && media.kind === 'image')),
    publicMedia,
  )
  const file = full
    ? detailed
    : {
        url: detailed.url || thumbnail.url,
        error: thumbnail.error,
        retry: () => {
          thumbnail.retry()
          detailed.retry()
        },
      }
  return (
    <div
      className={`private-media ${full ? 'private-media--full' : ''} ${feed ? 'private-media--feed' : ''}`}
      ref={ref}
      style={{ aspectRatio: `${media.width}/${media.height}` }}
    >
      {file.error && previewOnly ? (
        <span className="media-placeholder">Imagem indisponível</span>
      ) : file.error ? (
        <div className="media-placeholder">
          <p role="alert">{file.error}</p>
          <Button variant="ghost" onClick={file.retry}>
            Tentar novamente
          </Button>
        </div>
      ) : file.url ? (
        previewOnly ? (
          <img src={file.url} alt={alt} loading="lazy" />
        ) : full && media.kind === 'video' ? (
          <video src={file.url} controls playsInline preload="metadata" aria-label={alt} />
        ) : full ? (
          <img src={file.url} alt={alt} />
        ) : (
          <button
            className="media-open"
            type="button"
            aria-label={`${media.kind === 'video' ? 'Abrir vídeo' : 'Ampliar foto'}: ${alt}`}
            onClick={() => setExpanded(true)}
          >
            <img src={file.url} alt={alt} loading="lazy" />
            {media.kind === 'video' && (
              <span className="media-play">
                <Play /> Vídeo · {Math.ceil(media.duration ?? 0)} s
              </span>
            )}
          </button>
        )
      ) : (
        <div className="media-placeholder" aria-label="Carregando registro" />
      )}
      {expanded && (
        <MediaDialog
          publicMedia={publicMedia}
          media={media}
          alt={alt}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  )
}
function MediaDialog({
  media,
  alt,
  onClose,
  publicMedia = false,
}: {
  media: PostMedia
  alt: string
  onClose: () => void
  publicMedia?: boolean
}) {
  const file = useMediaUrl(media.id, 'full', true, publicMedia),
    [zoom, setZoom] = useState(1)
  return (
    <Sheet title="Visualizar registro" onClose={onClose} className="media-viewer">
      {media.kind === 'image' && (
        <div className="media-zoom-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Diminuir zoom"
            disabled={zoom === 1}
            onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
          >
            <ZoomOut size={20} />
          </button>
          <button
            type="button"
            className="button button--ghost"
            aria-label="Restaurar zoom"
            onClick={() => setZoom(1)}
          >
            <RotateCcw size={16} />
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Aumentar zoom"
            disabled={zoom === 4}
            onClick={() => setZoom((v) => Math.min(4, v + 0.5))}
          >
            <ZoomIn size={20} />
          </button>
        </div>
      )}
      <div className="media-zoom-scroll">
        {file.error ? (
          <p role="alert">
            {file.error}
            <Button onClick={file.retry}>Tentar novamente</Button>
          </p>
        ) : file.url ? (
          media.kind === 'video' ? (
            <video src={file.url} aria-label={alt} controls playsInline />
          ) : (
            <img src={file.url} alt={alt} style={{ width: `${zoom * 100}%` }} />
          )
        ) : (
          <p role="status">Abrindo foto…</p>
        )}
      </div>
    </Sheet>
  )
}
