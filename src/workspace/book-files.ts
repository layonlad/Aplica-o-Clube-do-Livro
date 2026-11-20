import type { User } from 'firebase/auth'
import { apiRequest, authenticatedResponse, ApiError } from '../auth/api'
import { localEpub, saveEpub } from './epub-storage'

/** Uso do armazenamento de EPUBs da conta: plano, limite e livros que já têm o arquivo guardado. */
export interface BookFilesUsage {
  enabled: boolean
  plan: string
  label: string
  limit: number
  used: number
  bookIds: string[]
}

export const BOOK_FILES_EVENT = 'clube-book-files-changed'
let coverUsage = new WeakMap<User, { expires: number; request: Promise<BookFilesUsage> }>()

export function announceBookFiles() {
  coverUsage = new WeakMap()
  window.dispatchEvent(new CustomEvent(BOOK_FILES_EVENT))
}

export function fetchUsage(user: User) {
  return apiRequest<BookFilesUsage>(user, '/me/book-files')
}

function coverAvailability(user: User) {
  const now = Date.now()
  const cache = coverUsage
  const current = cache.get(user)
  if (current && current.expires > now) return current.request
  const request = fetchUsage(user).catch(error => {
    if (cache.get(user)?.request === request) cache.delete(user)
    throw error
  })
  cache.set(user, { expires: now + 30_000, request })
  return request
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 16384)
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384))
  return btoa(binary)
}

/**
 * Guarda o EPUB original na conta (uma vez só). Se o livro já tem o arquivo, não faz nada.
 * Em "muitas tentativas" espera e tenta de novo, para a sincronização em lote não falhar à toa.
 */
export async function uploadOriginal(user: User, bookId: string, file: Blob, filename: string) {
  const data = toBase64(new Uint8Array(await file.arrayBuffer()))
  const name = /\.epub$/i.test(filename) ? filename.slice(0, 150) : 'livro.epub'
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await apiRequest(user, `/me/book-files/${bookId}`, 'POST', { filename: name, data })
      announceBookFiles()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FILE_EXISTS') return null
      if (error instanceof ApiError && error.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 15000 * (attempt + 1)))
        continue
      }
      throw error
    }
  }
}

/** Busca a capa do livro: primeiro a guardada neste aparelho, depois a da conta. */
export async function bookCoverBlob(user: User | null, bookId: string, signal?: AbortSignal) {
  const namespace = user?.emailVerified ? user.uid : 'visitor'
  const record = await localEpub(namespace, bookId).catch(() => undefined)
  if (record?.cover) return record.cover
  if (record) {
    const { readEpub } = await import('./epub-archive')
    const archive = await readEpub(record.file)
    const image = archive.coverPath ? archive.images.get(archive.coverPath) : undefined
    if (image) {
      const cover = new Blob([new Uint8Array(image.bytes)], { type: image.mime })
      void saveEpub(namespace, bookId, record.file, record.filename, cover, record.downloadCache ? user ?? undefined : undefined).catch(() => {})
      return cover
    }
  }
  if (!user?.emailVerified || !import.meta.env.VITE_API_URL) return undefined
  const usage = await coverAvailability(user).catch(() => undefined)
  if (signal?.aborted || !usage?.enabled || !usage.bookIds.includes(bookId)) return undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await authenticatedResponse(user, `/me/book-files/${bookId}/cover`, 'GET', undefined, signal)
      if (response.headers.get('content-type')?.startsWith('image/')) {
        const blob = await response.blob()
        if (blob.size <= 300000) return blob
      }
      return undefined
    } catch (error) {
      if (signal?.aborted || !(error instanceof ApiError) || error.status !== 429) return undefined
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
  return undefined
}

/**
 * Capa desenhada quando o livro não tem imagem de capa: mesma ideia da capa tipográfica do app.
 * Usada para compartilhar, já que a comunidade publica uma foto.
 */
export async function drawnCover(title: string, author: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 900
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const palette = ['#8a3f5c', '#4f6b52', '#3f4f7a', '#7a5a2f', '#5a3b8c']
  const color = palette[[...title].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]
  context.fillStyle = color
  context.fillRect(0, 0, 600, 900)
  context.fillStyle = 'rgba(0,0,0,0.18)'
  context.fillRect(0, 0, 48, 900)
  context.fillStyle = '#f4b942'
  context.fillRect(0, 640, 600, 70)
  context.fillStyle = '#fffbf4'
  context.font = "600 64px 'Merriweather Variable', Georgia, serif"
  const words = title.split(/\s+/)
  const lines: string[] = []
  for (const word of words) {
    const line = lines.length ? lines[lines.length - 1] + ' ' + word : word
    if (lines.length && context.measureText(line).width < 470) lines[lines.length - 1] = line
    else lines.push(word)
  }
  lines.slice(0, 6).forEach((line, index) => context.fillText(line, 90, 160 + index * 76))
  context.font = '700 28px "Plus Jakarta Sans", system-ui, sans-serif'
  context.fillText(author.toUpperCase().slice(0, 30), 90, 800)
  return new Promise<Blob | undefined>((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.9),
  )
}
