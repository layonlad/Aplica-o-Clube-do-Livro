export type FreeBookSourceId = 'curation' | 'gutenberg' | 'standard-ebooks'

export interface FreeBook {
  /** Identificador estável da edição. */
  id: string
  title: string
  authors: string[]
  /** Código ISO 639-1 ("pt", "en", …). */
  language: string
  year: number | null
  subjects: string[]
  description: string | null
  cover: string | null
  pages: number | null
  source: { id: FreeBookSourceId; name: string; url: string }
  license: { label: string; url: string | null; verifiedAt: string } | null
  /** Indica leitura interna autorizada. */
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
  postId: string | null
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
