import { mediaBase } from './social-api'
import { useEffect, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, ApiError, readableError } from '../auth/api'
import type { PostMedia, Page } from '../../server/src/community-contracts'
import { Button } from '../components/ui'
export async function uploadMediaFile(
  user: NonNullable<ReturnType<typeof useAuth>['user']>,
  clubId: string | null,
  file: File,
): Promise<PostMedia> {
  const kind = file.type.startsWith('video/') ? 'video' : 'image'
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(file.type) ||
    file.size > (kind === 'image' ? 5000000 : 10000000)
  )
    throw Error('Use uma foto JPEG, PNG ou WebP de até 5 MB, ou um MP4 de até 10 MB e 30 segundos.')
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
}: {
  clubId: string | null
  imagesOnly?: boolean
  value: PostMedia[]
  onChange: (value: PostMedia[]) => void
  onBusy?: (busy: boolean) => void
}) {
  const { user } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [recover, setRecover] = useState(false),
    [drafts, setDrafts] = useState<Page<PostMedia>>({ items: [], nextCursor: null })
  useEffect(() => {
    if (!recover || !user?.emailVerified) return
    let live = true
    apiRequest<Page<PostMedia>>(user, `${mediaBase(clubId)}/drafts`)
      .then((value) => live && setDrafts(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, clubId, recover])
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
    const selected = [...value]
    try {
      if (imagesOnly && files.some((file) => file.type.startsWith('video/')))
        throw Error('Anexe somente fotos nesta discussão.')
      if (files.length + value.length > 4) throw Error('Adicione até quatro arquivos de cada vez.')
      for (const file of files) {
        selected.push(await uploadMediaFile(user, clubId, file))
        onChange([...selected])
      }
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
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
    <div className="media-picker">
      <label className="file-button">
        {imagesOnly ? 'Adicionar fotos' : 'Adicionar fotos ou vídeo'}
        <input
          type="file"
          accept={
            imagesOnly
              ? 'image/jpeg,image/png,image/webp'
              : 'image/jpeg,image/png,image/webp,video/mp4'
          }
          multiple
          disabled={busy || value.length >= 4}
          onChange={(event) => {
            if (event.target.files) void files(Array.from(event.target.files))
            event.target.value = ''
          }}
        />
      </label>
      <small>
        {clubId === null
          ? 'Arquivos preparados para publicação pública. Fotos: até 5 MB; MP4: até 10 MB e 30 segundos.'
          : imagesOnly
            ? 'Fotos de até 5 MB, visíveis somente neste clube.'
            : 'Fotos: até 5 MB. MP4: até 10 MB e 30 segundos. Os registros pertencem a este clube.'}
      </small>
      {busy && <p role="status">Preparando o arquivo e sua miniatura…</p>}
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
        <summary>Recuperar arquivos preparados</summary>
        <p>
          Arquivos seus que ainda não estão publicados. A limpeza pode removê-los depois de um dia
          sem uso.
        </p>
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
function useMediaUrl(id: string, full: boolean, enabled: boolean, publicMedia = false) {
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
          `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1/${publicMedia ? 'public/' : ''}media/${id}/content?variant=${full ? 'full' : 'thumbnail'}`,
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
  }, [user?.uid, user?.emailVerified, id, full, enabled, retry, publicMedia])
  return { url, error, retry: () => setRetry((value) => value + 1) }
}
export function PrivateMedia({
  media,
  alt,
  full = false,
  publicMedia = false,
}: {
  media: PostMedia
  alt: string
  full?: boolean
  publicMedia?: boolean
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
  const file = useMediaUrl(media.id, full, visible, publicMedia)
  return (
    <div
      className={`private-media ${full ? 'private-media--full' : ''}`}
      ref={ref}
      style={{ aspectRatio: `${media.width}/${media.height}` }}
    >
      {file.error ? (
        <div className="media-placeholder">
          <p role="alert">{file.error}</p>
          <Button variant="ghost" onClick={file.retry}>
            Tentar novamente
          </Button>
        </div>
      ) : file.url ? (
        full && media.kind === 'video' ? (
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
  publicMedia?: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="media-dialog"
      aria-label={alt}
      onCancel={onClose}
      onClose={onClose}
    >
      <button
        className="icon-button media-close"
        type="button"
        aria-label="Fechar registro ampliado"
        onClick={onClose}
      >
        <X />
      </button>
      <PrivateMedia media={media} alt={alt} full publicMedia={publicMedia} />
      <p>{alt}</p>
    </dialog>
  )
}
