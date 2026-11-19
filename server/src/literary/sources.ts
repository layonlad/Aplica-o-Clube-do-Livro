import { HttpError } from '../errors.js'

export const userAgent = 'ClubeDoLivro/0.3 (https://github.com/layonlad/Aplica-o-Clube-do-Livro)'

export function referenceUrl(value: unknown, hosts: readonly string[]) {
  if (typeof value !== 'string' || value.length > 1200) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
        !hosts.includes(url.hostname)) return null
    url.protocol = 'https:'
    url.hash = ''
    return url
  } catch { return null }
}

export async function readLimited(response: Response, maxBytes: number) {
  if (!response.body || Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('Resposta da fonte acima do limite.')
  const stream = response.body.getReader()
  const buffers: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await stream.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error('Resposta da fonte acima do limite.')
      buffers.push(Buffer.from(value))
    }
  } catch (error) {
    await stream.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(buffers, total).toString('utf8')
}

export const boundaryText = (value: unknown, max = 150) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
export const listOf = (value: unknown): unknown[] => Array.isArray(value) ? value : []
export const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const foldLiterary = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export const missingLiterary = () => new HttpError(404, 'LITERARY_NOT_FOUND', 'Este item não está disponível.')
