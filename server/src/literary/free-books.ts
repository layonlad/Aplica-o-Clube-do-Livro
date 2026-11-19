import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Pool } from 'pg'
import type { UserProfile } from '../contracts.js'
import { epubCover, openEpubPackage } from '../epub-package.js'
import { HttpError } from '../errors.js'
import { foldLiterary, missingLiterary } from './sources.js'
import type { LiteraryPage } from './open-library.js'

export const genreLabels: Record<string, string> = {
  'literatura-brasileira': 'Literatura Brasileira', classicos: 'Clássicos', romance: 'Romance',
  fantasia: 'Fantasia', 'ficcao-cientifica': 'Ficção Científica', filosofia: 'Filosofia',
  poesia: 'Poesia', contos: 'Contos', historia: 'História', 'desenvolvimento-pessoal': 'Desenvolvimento Pessoal',
  infantil: 'Literatura Infantil',
}
export interface EditionRights {
  basis: 'public-domain' | 'license'
  license: string
  verifiedOn: string
  jurisdictions: string[]
  holder: string
  attribution: string
  evidence: string[]
  read: boolean
  store: boolean
  download: boolean
  transfer: boolean
  redistribute: boolean
  commercial: boolean
}
export interface FreeEdition {
  id: string
  workId: string
  title: string
  author: string
  language: string
  year: number | null
  genres: string[]
  description: string
  provider: 'Curadoria' | 'Project Gutenberg' | 'Standard Ebooks'
  source: string
  format: 'epub' | 'web'
  availability: 'internal' | 'external' | 'catalog'
  coverPath?: string
  rights: EditionRights | null
}

const machado = 'Machado de Assis'
const cartomante = 'a-cartomante-1896-pt'
const source = 'https://pt.wikisource.org/w/index.php?title=A_Cartomante&oldid=518402'
const editions: readonly FreeEdition[] = [
  {
    id: cartomante, workId: 'machado-a-cartomante', title: 'A Cartomante', author: machado,
    language: 'por', year: 1896, genres: ['literatura-brasileira', 'classicos', 'contos'], provider: 'Curadoria',
    description: 'Rita consulta uma cartomante. Camilo ri da confiança dela, até precisar enfrentar as suas próprias dúvidas. Texto em português da coletânea Várias Histórias.',
    source, format: 'epub', availability: 'internal', coverPath: `/v1/literary/free/${cartomante}/cover`,
    rights: {
      basis: 'public-domain', license: 'Texto original em domínio público; contribuições da edição em CC BY-SA 4.0',
      verifiedOn: '2026-11-18', jurisdictions: ['BR'],
      holder: 'Machado de Assis (texto histórico); colaboradores do Wikisource (transcrição, quando aplicável)',
      attribution: 'Machado de Assis, Várias Histórias, 1896. Transcrição Wikisource, revisão 518402. Empacotamento e capa tipográfica CC BY-SA 4.0.',
      evidence: [
        'https://www.planalto.gov.br/ccivil_03/leis/l9610.htm',
        'https://machado.mec.gov.br/obra-completa-lista/item/43-varias-historias',
        'https://www.prcultura.pr.gov.br/Pagina/Grandes-Contos-cartomante-de-Machado-de-Assis',
        source,
        'https://creativecommons.org/licenses/by-sa/4.0/',
      ],
      read: true, store: true, download: true, transfer: true, redistribute: true, commercial: true,
    },
  },
  {
    id: 'gutenberg-55752', workId: 'machado-dom-casmurro', title: 'Dom Casmurro', author: machado,
    language: 'por', year: 1899, genres: ['literatura-brasileira', 'classicos', 'romance'],
    description: 'Bento Santiago revisita a juventude, a amizade com Escobar e a vida com Capitu.',
    provider: 'Project Gutenberg', source: 'https://www.gutenberg.org/ebooks/55752', format: 'epub',
    availability: 'external', rights: null,
  },
  {
    id: 'gutenberg-57001', workId: 'machado-papeis-avulsos', title: 'Papéis Avulsos', author: machado,
    language: 'por', year: 1882, genres: ['literatura-brasileira', 'classicos', 'contos'],
    description: 'Coletânea de contos que inclui O Alienista e Teoria do Medalhão.',
    provider: 'Project Gutenberg', source: 'https://www.gutenberg.org/ebooks/57001', format: 'epub',
    availability: 'external', rights: null,
  },
  {
    id: 'gutenberg-61653', workId: 'machado-poesias-completas', title: 'Poesias Completas', author: machado,
    language: 'por', year: 1901, genres: ['literatura-brasileira', 'classicos', 'poesia'],
    description: 'Reúne Crisálidas, Falenas, Americanas e Ocidentais.',
    provider: 'Project Gutenberg', source: 'https://www.gutenberg.org/ebooks/61653', format: 'epub',
    availability: 'external', rights: null,
  },
  {
    id: 'standard-the-time-machine', workId: 'wells-the-time-machine', title: 'The Time Machine', author: 'H. G. Wells',
    language: 'eng', year: 1895, genres: ['classicos', 'ficcao-cientifica'],
    description: 'Um inventor viaja ao futuro e encontra uma sociedade transformada.',
    provider: 'Standard Ebooks', source: 'https://standardebooks.org/ebooks/h-g-wells/the-time-machine', format: 'epub',
    availability: 'external', rights: null,
  },
  {
    id: 'standard-pride-and-prejudice', workId: 'austen-pride-and-prejudice', title: 'Pride and Prejudice', author: 'Jane Austen',
    language: 'eng', year: 1813, genres: ['classicos', 'romance'],
    description: 'Elizabeth Bennet convive com as expectativas de sua família e revê suas primeiras impressões.',
    provider: 'Standard Ebooks', source: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice', format: 'epub',
    availability: 'external', rights: null,
  },
  {
    id: 'gutenberg-11', workId: 'carroll-alice-in-wonderland', title: 'Alice’s Adventures in Wonderland', author: 'Lewis Carroll',
    language: 'eng', year: 1865, genres: ['classicos', 'fantasia', 'infantil'],
    description: 'Alice segue um coelho e encontra um mundo em que as regras mudam a cada encontro.',
    provider: 'Project Gutenberg', source: 'https://www.gutenberg.org/ebooks/11', format: 'epub', availability: 'external', rights: null,
  },
  {
    id: 'gutenberg-4507', workId: 'allen-as-a-man-thinketh', title: 'As a Man Thinketh', author: 'James Allen',
    language: 'eng', year: 1903, genres: ['filosofia', 'desenvolvimento-pessoal'],
    description: 'Ensaio sobre pensamento, caráter e propósito.',
    provider: 'Project Gutenberg', source: 'https://www.gutenberg.org/ebooks/4507', format: 'epub', availability: 'external', rights: null,
  },
  {
    id: 'gutenberg-2707', workId: 'herodotus-histories', title: 'The History of Herodotus — Volume 1', author: 'Herodotus',
    language: 'eng', year: null, genres: ['historia', 'classicos'],
    description: 'Primeiro volume de Histórias, na tradução inglesa de George Campbell Macaulay.',
    provider: 'Project Gutenberg', source: 'https://www.gutenberg.org/ebooks/2707', format: 'epub', availability: 'external', rights: null,
  },
]

const assets: Record<string, { filename: string; sha256: string }> = {
  [cartomante]: {
    filename: cartomante + '.epub',
    sha256: 'eac519d66161560bc76b39d1b5ddf7cf45bb7911f5e1f25f49ea14e284363b40',
  },
}

export function freeEdition(id: string) {
  const book = editions.find((edition) => edition.id === id)
  if (!book) throw missingLiterary()
  return book
}

export interface FreeSearch extends LiteraryPage {
  q?: string; title?: string; author?: string; genre?: string; language?: string
  availability?: FreeEdition['availability']; format?: FreeEdition['format']; sort?: 'new' | 'old' | 'relevance'
}
export function searchFree(input: FreeSearch) {
  const q = foldLiterary(input.q ?? ''), title = foldLiterary(input.title ?? ''), author = foldLiterary(input.author ?? '')
  const matches = editions.filter(edition =>
    foldLiterary([edition.title, edition.author, ...edition.genres.map(genre => genreLabels[genre])].join(' ')).includes(q) && foldLiterary(edition.title).includes(title) &&
    foldLiterary(edition.author).includes(author) && (!input.language || edition.language === input.language) &&
    (!input.genre || edition.genres.includes(input.genre)) && (!input.availability || edition.availability === input.availability) &&
    (!input.format || edition.format === input.format),
  )
  if (input.sort === 'new') matches.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
  if (input.sort === 'old') matches.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity))
  const end = input.page * input.limit
  return {
    items: matches.slice(end - input.limit, end), nextPage: end < matches.length ? input.page + 1 : null,
    genres: Object.entries(genreLabels).filter(([id]) => editions.some(edition => edition.genres.includes(id)))
      .map(([id, label]) => ({ id, label })),
  }
}

export function matchFreeEdition(title: string, author: string, workId?: string) {
  const candidates = editions.filter(item => workId
    ? item.workId === workId
    : !!author && foldLiterary(item.title) === foldLiterary(title) && foldLiterary(item.author) === foldLiterary(author),
  )
  return candidates.length === 1 ? candidates[0] : null
}

export function editionMention(text: string) {
  const normalized = ' ' + foldLiterary(text) + ' '
  const candidates = editions.filter(item =>
    normalized.includes(' ' + foldLiterary(item.title) + ' ') && normalized.includes(' ' + foldLiterary(item.author) + ' '),
  )
  return candidates.length === 1 ? candidates[0] : null
}

export async function editionFile(id: string, purpose: 'read' | 'download' | 'transfer') {
  const book = freeEdition(id), asset = assets[id]
  if (book.availability !== 'internal' || !asset || !book.rights?.jurisdictions.includes('BR') ||
      !book.rights.evidence.length || !book.rights.verifiedOn ||
      !book.rights.read || !book.rights.store || !book.rights.redistribute || !book.rights[purpose]) throw missingLiterary()
  const bytes = await readFile(new URL(`../../assets/literary/${asset.filename}`, import.meta.url)).catch(() => null)
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw new HttpError(503, 'LITERARY_FILE_UNAVAILABLE', 'O arquivo desta edição está temporariamente indisponível.')
  return { bytes, filename: asset.filename }
}

export async function editionCover(id: string) {
  const { bytes } = await editionFile(id, 'read')
  const cover = epubCover(openEpubPackage(bytes))
  if (!cover || cover.mime !== 'image/jpeg') throw missingLiterary()
  return Buffer.from(cover.bytes)
}

async function clubBooks(pool: Pool, user: UserProfile) {
  const { rows } = await pool.query<{ id: string; name: string; title: string; author: string; workId?: string }>(
    `SELECT c.id,c.name,book->>'title' AS title,book->>'author' AS author,book->'metadata'->>'literaryWorkId' AS "workId"
     FROM club_memberships m JOIN clubs c ON c.id=m.club_id JOIN club_workspaces w ON w.club_id=c.id
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.state->'books','[]')) book
     WHERE m.user_id=$1 AND m.status='active' AND book->>'id'=w.state->>'currentBookId'
     ORDER BY c.created_at,c.id LIMIT 50`, [user.id],
  )
  return rows
}

export async function editionClubs(pool: Pool, user: UserProfile, edition: FreeEdition) {
  const items = (await clubBooks(pool, user))
    .filter(club => matchFreeEdition(club.title, club.author, club.workId ?? undefined)?.workId === edition.workId)
    .map(({id, name}) => ({ id, name }))
  return { items }
}

export async function bookRecommendations(pool: Pool, user: UserProfile) {
  const [preferences, clubs] = await Promise.all([
    pool.query<{ genres: string[]; works: string[] }>(
      `SELECT COALESCE(pr.genres,'{}') || ARRAY(SELECT DISTINCT book->>'category'
         FROM jsonb_array_elements(COALESCE(w.state->'books','[]')) book
         WHERE COALESCE(book->>'category','')<>'') AS genres,
       ARRAY(SELECT DISTINCT book->'metadata'->>'literaryWorkId'
         FROM jsonb_array_elements(COALESCE(w.state->'books','[]')) book
         WHERE book->'metadata'->>'literaryWorkId' IS NOT NULL) AS works
       FROM users u LEFT JOIN profiles pr ON pr.user_id=u.id LEFT JOIN personal_workspaces w ON w.user_id=u.id
       WHERE u.id=$1`, [user.id],
    ),
    clubBooks(pool, user),
  ])
  const own = preferences.rows[0]
  const interests = new Set((own?.genres ?? []).map(foldLiterary))
  const reading = new Set(clubs.flatMap(club => matchFreeEdition(club.title, club.author, club.workId ?? undefined)?.workId ?? []))
  const books = editions.filter(item => !own?.works.includes(item.workId)).map(item => {
    const genre = item.genres.find(id => interests.has(foldLiterary(genreLabels[id])) || interests.has(foldLiterary(id)))
    const club = reading.has(item.workId)
    return { ...item, score: (club ? 4 : 0) + (genre ? 2 : 0) + (item.availability === 'internal' ? 1 : 0),
      reason: club ? 'Leitura atual de um dos seus clubes' : genre ? `Seu interesse em ${genreLabels[genre]}` : 'Seleção da biblioteca gratuita' }
  }).sort((a,b) => b.score - a.score).slice(0, 6).map(({score: _, ...item}) => item)
  return { books, clubs: clubs.flatMap(club => {
    const edition = matchFreeEdition(club.title, club.author, club.workId ?? undefined)
    return edition ? [{ id: club.id, name: club.name, bookId: edition.id }] : []
  }) }
}
