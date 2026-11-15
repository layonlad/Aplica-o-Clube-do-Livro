import type { User } from 'firebase/auth'
import type { PostMedia } from '../../server/src/community-contracts'
import { apiRequest, ApiError } from '../auth/api'
interface Ticket {
  id: string
  completed: boolean
  uploaded?: boolean
  media?: PostMedia
  url?: string
  fields?: Record<string, string>
}
export interface PhotoUploadOptions {
  id: string
  signal: AbortSignal
  onProgress: (value: number) => void
}
/** The original goes straight to the private object store, never through JSON/base64. */
export async function uploadPhoto(
  user: User,
  clubId: string | null,
  file: File,
  options: PhotoUploadOptions,
) {
  if (
    file.size < 1 ||
    file.size > 100000000 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    throw Error('Selecione uma foto JPEG, PNG ou WebP de até 100 MB.')
  if (options.signal.aborted) throw new DOMException('Envio cancelado', 'AbortError')
  const ticket = await apiRequest<Ticket>(user, '/photo-uploads', 'POST', {
    id: options.id,
    clubId,
    contentType: file.type,
    byteSize: file.size,
  })
  if (ticket.completed && ticket.media) return ticket.media
  if (options.signal.aborted) {
    await apiRequest(user, `/photo-uploads/${options.id}`, 'DELETE').catch(() => {})
    throw new DOMException('Envio cancelado', 'AbortError')
  }
  if (!ticket.uploaded) {
    const form = new FormData()
    for (const [key, value] of Object.entries(ticket.fields!)) form.append(key, value)
    form.append('file', file)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const abort = () => xhr.abort()
      xhr.open('POST', ticket.url!)
      xhr.timeout = 10 * 60 * 1000
      xhr.withCredentials = false
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          options.onProgress(Math.min(95, Math.round((event.loaded / event.total) * 95)))
      }
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(Error('O envio da foto não foi concluído. Tente novamente.'))
      xhr.onerror = () =>
        reject(Error('A conexão foi interrompida. Tente novamente o mesmo envio.'))
      xhr.ontimeout = () => reject(Error('O envio demorou demais. Tente novamente.'))
      xhr.onabort = () => reject(new DOMException('Envio cancelado', 'AbortError'))
      xhr.onloadend = () => options.signal.removeEventListener('abort', abort)
      options.signal.addEventListener('abort', abort, { once: true })
      if (options.signal.aborted) {
        reject(new DOMException('Envio cancelado', 'AbortError'))
        return
      }
      xhr.send(form)
    })
  }
  if (options.signal.aborted) throw new DOMException('Envio cancelado', 'AbortError')
  options.onProgress(97)
  // Finalization is idempotent. A retry with this ticket returns the same media id.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal.aborted) throw new DOMException('Envio cancelado', 'AbortError')
    try {
      const media = await apiRequest<PostMedia>(
        user,
        `/photo-uploads/${options.id}/complete`,
        'POST',
        {},
      )
      options.onProgress(100)
      return media
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'MEDIA_BUSY' || attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw Error('Não foi possível preparar a foto.')
}
