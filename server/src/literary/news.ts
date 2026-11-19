import { createHash, randomUUID } from 'node:crypto'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { Pool } from 'pg'
import { transaction } from '../database.js'
import type { UserProfile } from '../contracts.js'
import { decodeCursor, pageOf } from '../pagination.js'
import { HttpError } from '../errors.js'
import { PostService } from '../post-service.js'
import { editorialAuthorId, visiblePublicPost } from '../public-policy.js'
import { editionMention, freeEdition } from './free-books.js'
import { boundaryText, foldLiterary, listOf, missingLiterary, readLimited, recordOf, referenceUrl, userAgent } from './sources.js'

export const newsCategories = {
  lancamentos: 'Lançamentos', mercado: 'Mercado editorial', eventos: 'Eventos literários',
  feiras: 'Feiras do livro', autores: 'Autores', premios: 'Prêmios literários',
  brasileira: 'Literatura Brasileira', tendencias: 'Tendências de leitura', adaptacoes: 'Adaptações',
  outros: 'Atualidades literárias',
} as const
export type NewsCategory = keyof typeof newsCategories

export const verifiedFeeds = [
  { source: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' },
  { source: 'Radioagência Nacional', url: 'https://agenciabrasil.ebc.com.br/radioagencia-nacional/rss/cultura/feed.xml' },
] as const

const rules: [NewsCategory, RegExp][] = [
  ['feiras', /\b(bienal|feira|festa literaria|festival literario|flip|flipei)\b/],
  ['premios', /\b(jabuti|premio|premiacao|premiad[oa]s?)\b/],
  ['adaptacoes', /\b(adaptac\w*|adaptad[oa]s?)\b/],
  ['lancamentos', /\b(lancament\w*|lanca|publica|estreia)\b/],
  ['mercado', /\b(mercado editorial|mercado de livros|livraria|livrarias|editoras?)\b/],
  ['eventos', /\b(evento|festival|seminario|encontro|oficina|sarau)\b/],
  ['brasileira', /\b(literatura brasileira|machado de assis|literatura nacional)\b/],
  ['tendencias', /\b(tendencia|pesquisa de leitura|habitos de leitura)\b/],
  ['autores', /\b(escritor[ae]s?|autor[ae]s?|poeta[ss]?)\b/],
]
const term = /\b(literari\w*|literatura|livros?|leitura|livrarias?|bibliotecas?|poesia|escritor\w*|jabuti|bienal do livro)\b/

interface NewsInput {
  title: string
  summary: string | null
  source: string
  url: string
  fingerprint: string
  author: string | null
  category: NewsCategory
  publishedAt: string
  bookId: string | null
}

export interface LiteraryNews extends Omit<NewsInput, 'fingerprint'> {
  id: string
  postId: string
  imageUrl: string | null
}

const parser = new XMLParser({ processEntities: false, parseTagValue: false, trimValues: true })
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as const
function rssText(value: unknown, max: number) {
  return boundaryText(typeof value === 'string' ? value
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: keyof typeof entities) => entities[name])
    .replace(/<[^>]*>/g, ' ') : '', max)
}

export function parseNewsFeed(xml: string, feed: (typeof verifiedFeeds)[number], now = Date.now()): NewsInput[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('RSS inválido.')
  const channel = recordOf(recordOf(recordOf(parser.parse(xml)).rss).channel)
  if (!channel.title) throw new Error('Canal RSS inválido.')
  const rawItems = channel.item ? (Array.isArray(channel.item) ? listOf(channel.item) : [channel.item]) : []
  return rawItems.slice(0, 100).flatMap(value => {
    const item = recordOf(value)
    const title = rssText(item.title, 300)
    const url = referenceUrl(item.link, ['agenciabrasil.ebc.com.br'])
    const date = Date.parse(rssText(item.pubDate, 100))
    if (!title || !url || !/\/(noticia|audio)\//.test(url.pathname) ||
        !Number.isFinite(date) || date > now + 3_600_000 || date < now - 180 * 86400_000) return []
    url.search = ''
    if (url.href.length > 500) return []
    const normalized = foldLiterary(title + ' ' + (typeof item.category === 'string' ? [item.category] : listOf(item.category)).slice(0, 20).map(item => rssText(item, 70)).join(' '))
    if (!term.test(normalized)) return []
    const publishedAt = new Date(date).toISOString()
    const fingerprint = createHash('sha256').update(feed.source + '|' + foldLiterary(title) + '|' + publishedAt.slice(0, 10)).digest('hex')
    return [{
      title, source: feed.source, url: url.href, author: rssText(item['dc:creator'], 150) || null,
      summary: null, publishedAt, category: rules.find(([,pattern]) => pattern.test(normalized))?.[0] ?? 'outros',
      bookId: editionMention(title)?.id ?? null, fingerprint,
    }]
  })
}

export async function syncLiteraryNews(pool: Pool, request: typeof fetch = fetch, now = Date.now()) {
  const lease = await pool.query(
    `INSERT INTO literary_news_sync(id,checked_at) VALUES('verified-feeds',now())
     ON CONFLICT(id) DO UPDATE SET checked_at=now()
     WHERE literary_news_sync.checked_at<=now()-interval '1 hour' RETURNING id`,
  )
  if (!lease.rowCount) return { inserted: 0, failedSources: 0, skipped: true }
  const inputs = await Promise.allSettled(verifiedFeeds.map(async feed => {
    const response = await request(feed.url, {
      redirect: 'error', signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/xml, text/xml' },
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error('Fonte editorial indisponível.') }
    return parseNewsFeed(await readLimited(response, 450_000), feed, now)
  }))
  const items = inputs.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  const inserted = await transaction(pool, async client => {
    let count = 0
    for (const item of items) {
      if ((await client.query('SELECT 1 FROM literary_news WHERE url=$1 OR fingerprint=$2', [item.url, item.fingerprint])).rowCount) continue
      const postId = randomUUID()
      const book = item.bookId ? freeEdition(item.bookId) : null
      await client.query(
        `INSERT INTO social_posts(id,author_user_id,audience,kind,body,source,book_title,book_author)
         VALUES($1,$2,'public','announcement',$3,$4,$5,$6)`,
        [postId, editorialAuthorId, item.title, item.url, book?.title ?? '', book?.author ?? ''],
      )
      await client.query(
        `INSERT INTO literary_news(post_id,title,summary,source,url,fingerprint,author,category,published_at,book_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [postId,item.title,item.summary,item.source,item.url,item.fingerprint,item.author,item.category,item.publishedAt,item.bookId],
      )
      count++
    }
    return count
  })
  return { inserted, failedSources: inputs.filter(result => result.status === 'rejected').length, skipped: false }
}

const columns = `n.id,n.post_id AS "postId",n.title,n.summary,n.source,n.url,n.author,n.published_at AS "publishedAt",
n.category,n.book_id AS "bookId",NULL::text AS "imageUrl"`
const categories = Object.entries(newsCategories).map(([id,label]) => ({ id, label }))

export class NewsService {
  constructor(private pool: Pool, private moderatorUids?: string[]) {}
  async list(user: UserProfile | null, input: { category?: NewsCategory; cursor?: string; limit: number; followed?: boolean }) {
    const cursor = decodeCursor(input.cursor)
    const { rows } = await this.pool.query<LiteraryNews & { sortTime: string }>(
      `SELECT ${columns},n.published_at::text AS "sortTime"
       FROM literary_news n JOIN social_posts p ON p.id=n.post_id WHERE ${visiblePublicPost('p', '$1')}
       AND ($2::text IS NULL OR n.category=$2)
       AND ($3::timestamptz IS NULL OR (n.published_at,n.id)<($3,$4::uuid))
       AND (NOT $6::boolean OR EXISTS(SELECT 1 FROM literary_follows f
         WHERE f.user_id=$1 AND f.kind='topic' AND f.item_key=n.category))
       ORDER BY n.published_at DESC,n.id DESC LIMIT $5`,
      [user?.id ?? null, input.category ?? null, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1, input.followed ?? false],
    )
    return { ...pageOf(rows, input.limit), categories }
  }

  async get(user: UserProfile | null, id: string) {
    const { rows: [item] } = await this.pool.query<LiteraryNews>(
      `SELECT ${columns} FROM literary_news n JOIN social_posts p ON p.id=n.post_id
       WHERE n.id=$2 AND ${visiblePublicPost('p', '$1')}`, [user?.id ?? null, id],
    )
    if (!item) throw missingLiterary()
    return item
  }

  async share(user: UserProfile, id: string, input: { clubId: string } | { debate: true }, requestId?: string) {
    const item = await this.get(user, id)
    const book = item.bookId ? freeEdition(item.bookId) : null
    return new PostService(this.pool, this.moderatorUids).create(user, 'clubId' in input ? input.clubId : null, {
      kind: 'debate' in input ? 'question' : 'reflection',
      body: `${item.title}\n${item.source}\n${item.url}`,
      source: item.url, bookTitle: book?.title ?? '', bookAuthor: book?.author ?? '',
      options: [], mediaIds: [], quote: '', clientRequestId: requestId,
    })
  }

  async follows(user: UserProfile) {
    const { rows } = await this.pool.query<{ kind: string; key: string }>(
      `SELECT f.kind,f.item_key AS key FROM literary_follows f
       LEFT JOIN social_posts p ON f.kind='debate' AND f.item_key=p.id::text
       WHERE f.user_id=$1 AND (f.kind='topic' OR (p.kind='question' AND ${visiblePublicPost('p','$1')}))
       ORDER BY f.created_at DESC,f.item_key LIMIT 100`, [user.id],
    )
    return { topics: rows.filter(row => row.kind === 'topic').map(row => row.key),
      debates: rows.filter(row => row.kind === 'debate').map(row => row.key) }
  }

  async follow(user: UserProfile, input: { kind: 'topic' | 'debate'; key: string; value: boolean }) {
    if (input.kind === 'topic' && !Object.hasOwn(newsCategories, input.key)) throw missingLiterary()
    await transaction(this.pool, async client => {
      const bindings = [user.id, input.kind, input.key]
      if (!input.value) {
        await client.query('DELETE FROM literary_follows WHERE user_id=$1 AND kind=$2 AND item_key=$3', bindings)
        return
      }
      if (input.kind === 'debate' && !(await client.query(
        `SELECT 1 FROM social_posts p WHERE p.id=$2 AND p.kind='question' AND ${visiblePublicPost('p', '$1')}`, [user.id, input.key],
      )).rowCount) throw missingLiterary()
      // Serialize additions per account to bound stored interests.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id])
      const updated = await client.query(
        `INSERT INTO literary_follows(user_id,kind,item_key) SELECT $1,$2,$3
         WHERE (SELECT count(*) FROM literary_follows WHERE user_id=$1)<100
         ON CONFLICT DO NOTHING`, bindings,
      )
      if (!updated.rowCount && !(await client.query('SELECT 1 FROM literary_follows WHERE user_id=$1 AND kind=$2 AND item_key=$3', bindings)).rowCount)
        throw new HttpError(409, 'LITERARY_FOLLOW_LIMIT', 'Você atingiu o limite de assuntos e debates seguidos.')
    })
    return { value: input.value }
  }
}
