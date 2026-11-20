import { HttpError } from '../errors.js'
import { maxClippingsBytes, type ImportedClipping } from './providers.js'

const header = /^- (?:Your (Highlight|Note|Bookmark)|Seu (destaque|marcador)|Sua (nota|anotação))\b/iu
const invalid = (message: string) => new HttpError(400, 'INVALID_CLIPPINGS', message)

export function parseClippings(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > maxClippingsBytes)
    throw new HttpError(413, 'CLIPPINGS_SIZE', 'Escolha um TXT com até 256 KB.')
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le'
    : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8'
  let text: string
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n')
  } catch {
    throw invalid('Codificação incompatível. Use UTF-8 ou UTF-16 com marca de início.')
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) throw invalid('O arquivo precisa conter texto simples.')
  const blocks = text.split(/^={10}[ \t]*$/m).map((block) => block.trim()).filter(Boolean)
  if (blocks.length > 1000) throw invalid('Escolha um TXT com até 1.000 registros.')
  const entries: ImportedClipping[] = []
  let skipped = 0
  for (const block of blocks) {
    const [sourceBook, meta = '', ...body] = block.split('\n')
    const match = header.exec(meta.trim())
    const marker = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase()
    const content = body.join('\n').trim()
    if (!match || /^(bookmark|marcador)$/.test(marker) || !content || sourceBook.length > 400
      || content.length > 2000
      || /(?:reached the clipping limit|limite de (?:recortes|destaques))/i.test(content)) {
      skipped++
      continue
    }
    const parts = meta.split('|').map((part) => part.trim())
    const dateIndex = parts.findIndex((part) => /^(added on|adicionad[oa] em)\b/i.test(part))
    const date = parts[dateIndex]
    const position = (dateIndex < 0 ? parts : parts.slice(0, dateIndex)).join(' ')
    const range = /(?:location|posiç(?:ão|ões)|localização)\s+([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)/iu.exec(position)
    const page = /(?:page|página)\s+([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)/iu.exec(position)
    entries.push({
      sourceBook,
      kind: /^(highlight|destaque)$/.test(marker) ? 'highlight' : 'note',
      location: range ? `Posição ${range[1].slice(0, 65)}` : page ? `Página ${page[1].slice(0, 65)}` : '',
      sourceDate: date?.replace(/^(added on|adicionad[oa] em)\s*/i, '').slice(0, 160) ?? '',
      content,
    })
  }
  if (!entries.length) throw invalid('Nenhuma nota ou destaque compatível foi encontrado no TXT My Clippings.')
  return { entries, skipped }
}
