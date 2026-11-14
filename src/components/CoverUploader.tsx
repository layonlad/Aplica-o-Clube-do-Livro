import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, messageFor } from '../auth/api'
import { Button } from './ui'
import { PrivateMedia } from '../community/PrivateMedia'
import { fileToBase64 } from './AvatarUploader'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const OUT_W = 1600
const OUT_H = 500

/** Valida a capa antes do envio. GIF vai sem recorte (mantém a animação), até 8 MB. Exportado para testes. */
export function coverFileError(file: Pick<File, 'type' | 'size'>) {
  if (!ACCEPTED.includes(file.type)) return 'Escolha uma imagem JPG, PNG, WebP ou GIF.'
  if (file.type === 'image/gif' && file.size > 8_000_000) return 'O GIF passa de 8 MB. Escolha um arquivo menor.'
  if (file.size > 15_000_000) return 'A imagem passa de 15 MB. Escolha uma imagem menor.'
  return ''
}

/** Recorta a faixa visível (proporção 16:5) e comprime em WebP; `position` vai de 0 (topo) a 1 (base). */
async function exportBanner(image: HTMLImageElement, position: number) {
  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const context = canvas.getContext('2d')
  if (!context) throw Error('Seu navegador não conseguiu preparar a capa.')
  const scale = Math.max(OUT_W / image.naturalWidth, OUT_H / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, (OUT_W - width) / 2, -(height - OUT_H) * position, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
  const final =
    blob && blob.type === 'image/webp'
      ? blob
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!final) throw Error('Seu navegador não conseguiu comprimir a capa.')
  return fileToBase64(final)
}

/**
 * Capa do perfil: escolher (JPG, PNG, WebP ou GIF animado), ajustar a altura visível e salvar.
 * Salva na hora, sem depender do botão do formulário do perfil.
 */
export function CoverUploader({
  coverId,
  isPublic,
  onChange,
}: {
  coverId: string | null
  isPublic: boolean
  onChange: (coverId: string | null) => void
}) {
  const { user } = useAuth()
  const [source, setSource] = useState<{ url: string; file: File } | null>(null)
  const [position, setPosition] = useState(0.5)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ y: number; position: number; height: number } | null>(null)
  const gif = source?.file.type === 'image/gif'

  useEffect(() => () => void (source && URL.revokeObjectURL(source.url)), [source])

  function choose(file: File | undefined) {
    setMessage('')
    setError('')
    if (!file) return
    const problem = coverFileError(file)
    if (problem) {
      setError(problem)
      return
    }
    setPosition(0.5)
    setSource({ url: URL.createObjectURL(file), file })
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (gif) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { y: event.clientY, position, height: event.currentTarget.clientHeight }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const delta = (event.clientY - drag.current.y) / (drag.current.height * 2)
    setPosition(Math.max(0, Math.min(1, drag.current.position - delta)))
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (gif) return
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const step = event.shiftKey ? 0.15 : 0.05
      setPosition((value) => Math.max(0, Math.min(1, value + (event.key === 'ArrowDown' ? step : -step))))
    }
  }

  async function save() {
    if (!user || !source) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      // GIF vai como está para manter a animação; o servidor converte em WebP animado.
      const data = gif ? await fileToBase64(source.file) : image.current ? await exportBanner(image.current, position) : ''
      if (!data) throw Error('A imagem ainda está carregando. Tente de novo em instantes.')
      const result = await apiRequest<{ coverId: string }>(user, '/me/cover', 'POST', { data })
      onChange(result.coverId)
      setSource(null)
      setMessage(
        isPublic
          ? 'Capa salva. Ela já aparece no seu perfil público.'
          : 'Capa salva. Ela aparece quando você ativar o perfil público.',
      )
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!user) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(user, '/me/cover', 'DELETE')
      onChange(null)
      setConfirmRemove(false)
      setMessage('Capa removida.')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cover-uploader" aria-labelledby="cover-uploader-title">
      <h2 id="cover-uploader-title">Capa do perfil</h2>
      <p>
        Imagem larga no topo do seu perfil público. Aceita JPG, PNG, WebP e GIF animado (até 8 MB).
        {!isPublic && ' Seu perfil está privado: a capa fica guardada e aparece quando você ativar o perfil público.'}
      </p>
      {source ? (
        <div className="cover-cropper">
          <div
            className={`cover-cropper__stage ${gif ? 'is-gif' : ''}`}
            role="group"
            tabIndex={gif ? -1 : 0}
            aria-label={gif ? 'Prévia da capa animada' : 'Enquadramento da capa. Arraste para cima ou para baixo, ou use as setas.'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={onKeyDown}
          >
            <img ref={image} src={source.url} alt="" draggable={false} style={{ objectPosition: `50% ${position * 100}%` }} />
          </div>
          {gif ? (
            <p className="t-caption">GIFs são enviados inteiros para manter a animação; o centro da imagem aparece na faixa.</p>
          ) : (
            <label className="avatar-cropper__zoom cover-cropper__position">
              Posição vertical
              <input type="range" min={0} max={1} step={0.01} value={position} onChange={(event) => setPosition(Number(event.target.value))} />
            </label>
          )}
          <div className="workspace-actions">
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? 'Enviando capa…' : 'Salvar capa'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setSource(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="cover-uploader__current">
            {coverId ? (
              <PrivateMedia full publicMedia media={{ id: coverId, kind: 'image', width: 16, height: 5, duration: null }} alt="Capa atual do perfil" />
            ) : (
              <span className="cover-uploader__empty" aria-hidden="true" />
            )}
          </div>
          <div className="workspace-actions">
            <label className="file-button">
              <ImagePlus size={18} aria-hidden="true" />
              {coverId ? 'Trocar capa' : 'Adicionar capa'}
              <input
                type="file"
                accept={ACCEPTED.join(',')}
                aria-label={coverId ? 'Trocar capa do perfil' : 'Adicionar capa do perfil'}
                disabled={busy}
                onChange={(event) => {
                  choose(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
            {coverId &&
              (confirmRemove ? (
                <>
                  <span>Remover a capa?</span>
                  <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                    Remover
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
                  <Trash2 size={16} aria-hidden="true" /> Remover capa
                </Button>
              ))}
          </div>
        </>
      )}
      {busy && <p className="t-caption" role="status">Preparando e enviando a capa…</p>}
      {message && <p className="toast-status" role="status">{message}</p>}
      {error && <p className="access-error" role="alert">{error}</p>}
    </section>
  )
}
