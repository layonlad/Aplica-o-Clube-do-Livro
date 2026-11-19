import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Newspaper, Send } from 'lucide-react'
import { readableError } from '../auth/api'
import { fetchNews, ServiceNotReady } from '../literary/api'
import type { NewsItem, NewsPage } from '../literary/contracts'
import { ago } from './kit'

/** Notícias literárias agregadas pelo servidor. Cada matéria abre no site original, com a fonte sempre visível. */
export function NewsFeed() {
  const [category, setCategory] = useState('')
  const [page, setPage] = useState<NewsPage | null>(null)
  const [categories, setCategories] = useState<NewsPage['categories']>([])
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let live = true
    setPage(null)
    setError('')
    setNotReady(false)
    fetchNews({ category })
      .then((value) => {
        if (!live) return
        setPage(value)
        if (value.categories.length) setCategories(value.categories)
      })
      .catch((err) => {
        if (!live) return
        if (err instanceof ServiceNotReady) setNotReady(true)
        else setError(readableError(err))
      })
    return () => { live = false }
  }, [category, retry])

  async function more() {
    if (!page?.nextCursor || busy) return
    setBusy(true)
    try {
      const next = await fetchNews({ category, cursor: page.nextCursor })
      setPage((current) => current && { ...current, items: [...current.items, ...next.items.filter((item) => !current.items.some((old) => old.id === item.id))], nextCursor: next.nextCursor })
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  if (notReady)
    return (
      <div className="soft-empty">
        <Newspaper size={26} aria-hidden="true" />
        <h2 className="soft-empty__title">As notícias estão sendo conectadas</h2>
        <p>Lançamentos, prêmios e eventos literários aparecem aqui assim que o servidor começar a reunir as fontes.</p>
        <button type="button" className="pill-button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
      </div>
    )
  const [lead, ...rest] = page?.items ?? []
  return (
    <section className="news-feed" aria-label="Notícias literárias">
      {categories.length > 0 && (
        <div className="pill-tabs news-categories" role="group" aria-label="Assuntos">
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>Tudo</button>
          {categories.map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" className="access-error">
          {error}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
        </div>
      )}
      {!page && !error && (
        <div className="news-list" aria-hidden="true">
          <span className="skeleton" style={{ height: 230, borderRadius: 16 }} />
          {[0, 1, 2].map((key) => <span key={key} className="skeleton" style={{ height: 96, borderRadius: 16 }} />)}
        </div>
      )}
      {page && !page.items.length && !error && <p className="soft-empty">Nenhuma notícia neste assunto por enquanto.</p>}
      {lead && (
        <div className="news-list">
          <NewsCard item={lead} featured label={categories.find((item) => item.id === lead.category)?.label} />
          {rest.map((item) => <NewsCard key={item.id} item={item} label={categories.find((other) => other.id === item.category)?.label} />)}
        </div>
      )}
      {page?.nextCursor && (
        <div className="library-add"><button type="button" className="pill-button" disabled={busy} aria-busy={busy} onClick={() => void more()}>Mais notícias</button></div>
      )}
    </section>
  )
}

function NewsCard({ item, featured = false, label }: { item: NewsItem; featured?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url: item.url }); return } catch (error) { if ((error as Error).name === 'AbortError') return }
    }
    await navigator.clipboard?.writeText(item.url).then(() => setCopied(true)).catch(() => undefined)
    setTimeout(() => setCopied(false), 2200)
  }
  return (
    <article className={`news-card ${featured ? 'news-card--lead' : ''}`}>
      <a className="news-card__link" href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {item.image ? (
          <img className="news-card__image" src={item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />
        ) : featured ? <span className="news-card__image news-card__image--empty" aria-hidden="true"><Newspaper size={30} /></span> : null}
        <span className="news-card__body">
          {label && <span className="tag">{label}</span>}
          <strong>{item.title}</strong>
          {item.summary && <span className="news-card__summary">{item.summary}</span>}
          <span className="news-card__meta">{item.source.name} · <time dateTime={item.publishedAt}>{ago(item.publishedAt)}</time><ExternalLink size={13} aria-hidden="true" /></span>
        </span>
      </a>
      <button type="button" className="news-card__share" aria-label={copied ? 'Link copiado' : `Compartilhar “${item.title}”`} onClick={() => void share()}>
        <Send size={16} aria-hidden="true" />
      </button>
      {item.postId && <Link className="text-link" to={`/app/community?post=${encodeURIComponent(item.postId)}`}>Discussão</Link>}
      {copied && <span className="sr-only" role="status">Link copiado</span>}
    </article>
  )
}
