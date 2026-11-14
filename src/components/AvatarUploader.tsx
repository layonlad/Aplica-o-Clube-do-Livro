import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, messageFor, readableError } from '../auth/api'
import { Button } from './ui'
import { AVATAR_EVENT, UserAvatar, forgetAvatar } from './UserAvatar'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_INPUT = 15_000_000
const OUTPUT = 512
const VIEW = 240

export { AVATAR_EVENT }

/** Valida o arquivo escolhido antes de qualquer leitura. Exportado para testes. */
export function avatarFileError(file: Pick<File, 'type' | 'size'>) {
  if (!ACCEPTED.includes(file.type)) return 'Escolha uma foto JPG, PNG, WebP ou GIF.'
  if (file.type === 'image/gif' && file.size > 8_000_000) return 'O GIF passa de 8 MB. Escolha um arquivo menor.'
  if (file.size > MAX_INPUT) return 'A foto escolhida passa de 15 MB. Escolha uma imagem menor.'
  return ''
}

/** Converte um arquivo/blob em base64 sem estourar a pilha em arquivos grandes. */
export async function fileToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384))
  return btoa(binary)
}

type Crop = { zoom: number; x: number; y: number }

/** Recorta a área visível do círculo em um quadrado de 512 px e comprime em WebP (ou JPEG). */
async function exportCrop(image: HTMLImageElement, crop: Crop) {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT
  canvas.height = OUTPUT
  const context = canvas.getContext('2d')
  if (!context) throw Error('Seu navegador não conseguiu preparar a foto.')
  const base = Math.max(VIEW / image.naturalWidth, VIEW / image.naturalHeight)
  const scale = base * crop.zoom
  const ratio = OUTPUT / VIEW
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#fbf4e8'
  context.fillRect(0, 0, OUTPUT, OUTPUT)
  context.drawImage(
    image,
    (VIEW / 2 + crop.x - (image.naturalWidth * scale) / 2) * ratio,
    (VIEW / 2 + crop.y - (image.naturalHeight * scale) / 2) * ratio,
    image.naturalWidth * scale * ratio,
    image.naturalHeight * scale * ratio,
  )
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  const final =
    blob && blob.type === 'image/webp'
      ? blob
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!final) throw Error('Seu navegador não conseguiu comprimir a foto.')
  return { data: await fileToBase64(final), preview: URL.createObjectURL(final) }
}

/**
 * Foto do perfil: escolher, reposicionar e ampliar dentro do círculo, ver a prévia e salvar.
 * A foto vale para a conta toda e aparece ao lado do nome em murais, fórum e listas de membros.
 */
export function AvatarUploader({
  name,
  avatarId,
  onChange,
}: {
  name: string
  avatarId: string | null
  onChange: (avatarId: string | null) => void
}) {
  const { user } = useAuth()
  const [source, setSource] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [gifFile, setGifFile] = useState<File | null>(null)
  const image = useRef<HTMLImageElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)

  useEffect(() => () => void (source && URL.revokeObjectURL(source)), [source])

  function choose(file: File | undefined) {
    setMessage('')
    setError('')
    if (!file) return
    const problem = avatarFileError(file)
    if (problem) {
      setError(problem)
      return
    }
    setCrop({ zoom: 1, x: 0, y: 0 })
    setNatural(null)
    // GIF vai sem recorte para manter a animação; o círculo mostra o centro da imagem.
    setGifFile(file.type === 'image/gif' ? file : null)
    setSource(URL.createObjectURL(file))
  }

  function move(dx: number, dy: number) {
    setCrop((value) => {
      const limit = (VIEW / 2) * value.zoom
      return {
        ...value,
        x: Math.max(-limit, Math.min(limit, value.x + dx)),
        y: Math.max(-limit, Math.min(limit, value.y + dy)),
      }
    })
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, crop }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const start = drag.current
    const limit = (VIEW / 2) * start.crop.zoom
    setCrop({
      ...start.crop,
      x: Math.max(-limit, Math.min(limit, start.crop.x + event.clientX - start.x)),
      y: Math.max(-limit, Math.min(limit, start.crop.y + event.clientY - start.y)),
    })
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 20 : 6
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[event.key]) {
      event.preventDefault()
      move(...moves[event.key])
    }
  }

  async function save() {
    if (!user || (!image.current && !gifFile)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      let data: string
      if (gifFile) data = await fileToBase64(gifFile)
      else {
        const exported = await exportCrop(image.current!, crop)
        URL.revokeObjectURL(exported.preview)
        data = exported.data
      }
      const result = await apiRequest<{ avatarId: string }>(user, '/me/avatar', 'POST', { data })
      forgetAvatar(avatarId)
      onChange(result.avatarId)
      window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: result.avatarId }))
      setSource(null)
      setMessage('Foto atualizada. Ela já aparece nas suas publicações e comentários.')
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
      await apiRequest(user, '/me/avatar', 'DELETE')
      forgetAvatar(avatarId)
      onChange(null)
      window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: null }))
      setConfirmRemove(false)
      setMessage('Foto removida. Suas iniciais aparecem no lugar.')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="avatar-uploader" aria-labelledby="avatar-uploader-title">
      <div className="avatar-uploader__current">
        <UserAvatar name={name} avatarId={avatarId} size="xl" />
      </div>
      <div className="avatar-uploader__body">
        <h2 id="avatar-uploader-title">Sua foto</h2>
        <p>
          Aparece ao lado do seu nome nos murais, no fórum e nas listas de membros. Pessoas dos seus
          clubes veem a foto; na comunidade, ela aparece quando seu perfil é público.
        </p>
        {!source && (
          <div className="workspace-actions">
            <label className="file-button">
              <Camera size={18} aria-hidden="true" />
              {avatarId ? 'Trocar foto' : 'Adicionar foto'}
              <input
                ref={input}
                type="file"
                accept={ACCEPTED.join(',')}
                aria-label={avatarId ? 'Trocar foto do perfil' : 'Adicionar foto do perfil'}
                disabled={busy}
                onChange={(event) => {
                  choose(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
            {avatarId &&
              (confirmRemove ? (
                <>
                  <span>Remover a foto?</span>
                  <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                    Remover
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
                  <Trash2 size={16} aria-hidden="true" /> Remover foto
                </Button>
              ))}
          </div>
        )}
        {source && gifFile && (
          <div className="avatar-cropper">
            <span className="user-avatar user-avatar--xl has-photo" aria-hidden="true">
              <img src={source} alt="" />
            </span>
            <p className="t-caption">GIFs são enviados inteiros para manter a animação; o centro aparece no círculo.</p>
            <div className="workspace-actions">
              <Button disabled={busy} onClick={() => void save()}>
                {busy ? 'Enviando foto…' : 'Salvar foto'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSource(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {source && !gifFile && (
          <div className="avatar-cropper">
            <div
              className="avatar-cropper__stage"
              role="group"
              tabIndex={0}
              aria-label="Enquadramento da foto. Arraste ou use as setas para reposicionar."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKeyDown}
              style={{ width: VIEW, height: VIEW }}
            >
              <img
                ref={image}
                src={source}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })
                  setCrop({ zoom: 1, x: 0, y: 0 })
                }}
                style={{
                  ...(natural
                    ? (() => {
                        const base = Math.max(VIEW / natural.w, VIEW / natural.h)
                        return { width: natural.w * base, height: natural.h * base }
                      })()
                    : { visibility: 'hidden' as const }),
                  transform: `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px) scale(${crop.zoom})`,
                }}
              />
              <span className="avatar-cropper__mask" aria-hidden="true" />
            </div>
            <label className="avatar-cropper__zoom">
              Ampliar
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={crop.zoom}
                onChange={(event) => setCrop((value) => ({ ...value, zoom: Number(event.target.value) }))}
              />
            </label>
            <div className="workspace-actions">
              <Button disabled={busy} onClick={() => void save()}>
                {busy ? 'Enviando foto…' : 'Salvar foto'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSource(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {busy && <p className="t-caption" role="status">Preparando e enviando sua foto…</p>}
        {message && <p className="toast-status" role="status">{message}</p>}
        {error && <p className="access-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
