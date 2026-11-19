/**
 * Contrato v1 da Biblioteca Gratuita e das Notícias literárias, consumido pelo site.
 * O servidor (Codex) implementa estas rotas; o documento completo está em docs/CONTRATO_LIVROS_GRATUITOS_NOTICIAS.md.
 * Mudanças que quebram o formato pedem uma nova versão (v2), nunca uma alteração silenciosa da v1.
 *
 *   GET /v1/free-books/home                       → FreeBookHome
 *   GET /v1/free-books?q=&category=&language=&cursor=&limit= → FreeBookPage
 *   GET /v1/free-books/:id                        → FreeBook
 *   GET /v1/free-books/:id/epub                   → arquivo application/epub+zip (licença já verificada)
 *   GET /v1/news?category=&cursor=&limit=         → NewsPage
 *
 * Todas são públicas (sem login), só leitura, com cache no servidor.
 */

export const LITERARY_CONTRACT_VERSION = 1

export type FreeBookSourceId = 'gutenberg' | 'standard-ebooks' | 'open-library'
export type FreeBookLicenseKind = 'public-domain' | 'cc0' | 'cc-by' | 'cc-by-sa' | 'other-open'

export interface FreeBook {
  /** Identificador estável com a fonte, ex.: "gutenberg:55752" ou "standard-ebooks:machado-de-assis/dom-casmurro". */
  id: string
  title: string
  authors: string[]
  /** Código ISO 639-1 ("pt", "en", …). */
  language: string
  year: number | null
  subjects: string[]
  description: string | null
  /** URL https da capa (de preferência servida pela própria API). */
  cover: string | null
  pages: number | null
  source: { id: FreeBookSourceId; name: string; url: string }
  license: { kind: FreeBookLicenseKind; label: string; url: string | null; verifiedAt: string }
  /** true quando /epub entrega o arquivo. Sem EPUB o livro só pode ser aberto na fonte. */
  epub: boolean
}

export interface FreeBookSection {
  id: string
  title: string
  items: FreeBook[]
}

export interface FreeBookHome {
  sections: FreeBookSection[]
  categories: { id: string; label: string }[]
}

export interface FreeBookPage {
  items: FreeBook[]
  nextCursor: string | null
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  /** Link https para a matéria original. */
  url: string
  source: { name: string; url: string }
  image: string | null
  publishedAt: string
  category: string
}

export interface NewsPage {
  items: NewsItem[]
  nextCursor: string | null
  categories: { id: string; label: string }[]
}
